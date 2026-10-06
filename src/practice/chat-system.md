---
title: Design a chat system (like WhatsApp)
navTitle: Chat system
order: 3
difficulty: Hard
summary: Real-time one-to-one and group messaging with delivery receipts, offline delivery and multi-device sync. Tests WebSockets at scale, routing, ordering and delivery guarantees.
cards: chat-system
glance:
  - "Clients keep a **WebSocket** to a gateway tier; a **session registry** maps user → gateway."
  - "Messages are **persisted before they're acknowledged**, then routed to online recipients or pushed to offline ones."
  - "Order **per conversation** with a sequence number; dedupe retries with a client message ID."
  - "Each device syncs with a **cursor**: fetch everything after the last message it saw."
---
## 1. Clarify requirements

{% callout "think", "Thinking out loud" %}
"Chat has a long feature list, so I'll scope it hard: one-to-one and small groups, text first, receipts and offline delivery. I'll ask about group size and multi-device, because both change the fan-out and sync design."
{% endcallout %}

**Functional**

- **1:1 and group chats** (groups up to ~500 members).
- **Sent / delivered / read** receipts.
- **Offline delivery**: messages wait and arrive when the user comes online; push notification meanwhile.
- **Multi-device**: history syncs across a user's phone and laptop.
- **Online presence** and "last seen".
- Out of scope for now: voice and video calls, stories. Media is mentioned briefly.

**Non-functional**

- **Low latency** delivery (< 200 ms when both users are online).
- **No message loss**, and ordering within a conversation.
- **High availability**; durable storage.
- Scale: **50M daily active users**, ~40 messages per user per day.

## 2. Estimates

- Messages: 50M × 40 = **2 billion/day** → 2 × 10⁹ ÷ 10⁵ ≈ **20k msg/s** average, ~**60k/s** peak.
- Storage: 2B × ~200 bytes ≈ **400 GB/day** → ~**150 TB/year** (before replication). A write-heavy, append-mostly workload.
- Concurrent connections: suppose 20% of DAU are online at peak → **10M open WebSockets**. At ~50k connections per gateway server, that's **~200 gateway servers**.

{% callout "think", "Thinking out loud" %}
"Two things stand out. First, ten million long-lived connections means a dedicated gateway tier and a way to find which gateway a user is on. Second, 60k writes a second, append-only and read by conversation, points at a wide-column store partitioned by conversation."
{% endcallout %}

## 3. API

Real-time events over the WebSocket:

```
→ send       { client_msg_id, conversation_id, body, sent_at }
← ack        { client_msg_id, message_id, seq }            (stored)
← message    { message_id, conversation_id, seq, sender, body }
→ receipt    { conversation_id, up_to_seq, type: delivered|read }
← presence   { user_id, online, last_seen }
```

REST for history and setup:

```
GET  /v1/conversations/{id}/messages?before_seq=…&limit=50
GET  /v1/sync?since_cursor=…        (everything new for this device)
POST /v1/conversations               (create group)
```

## 4. Data model

| Store | Data | Why |
|---|---|---|
| **Message store** (Cassandra / ScyllaDB) | `messages(conversation_id PK, seq CK, message_id, sender_id, body, created_at)` | Write-heavy and append-only; reads are "latest N in a conversation"; partition by conversation, cluster by `seq` |
| **SQL** | users, conversations, members | Relational, low volume, needs constraints |
| **Redis** | session registry `user → [gateway, device]`, presence, unread counts | Fast, ephemeral, frequently updated |
| **Per-user inbox** | `inbox(user_id, conversation_id, last_seq)` | What each user has seen; drives sync |

## 5. High-level design

{% diagram "Chat: gateways hold connections, a chat service persists and routes, push covers offline users" %}
a: Alice [client] @ 0,0
b: Bob [client] @ 0,2
g1: WS gateway 1 [lb] @ 1,0
g2: WS gateway 2 [lb] @ 1,2
chat: Chat service @ 2,1
sess: Session registry\n(Redis) [cache] @ 3.4,0
store: Message store\n(Cassandra) [db] @ 3.4,1
push: Push service\n(APNs / FCM) [ext] @ 3.4,2
a <-> g1
b <-> g2
g1 -> chat : 1. send
chat -> store : 2. persist
chat -> sess : 3. where is Bob?
chat -> g2 : 4. deliver
chat --> push : if offline
{% enddiagram %}

## 6. Deep dives

### The life of a message

1. Alice's app sends `send` with a **`client_msg_id`** (a UUID it generates) over her WebSocket.
2. The chat service assigns the next **`seq`** for the conversation, and **persists** the message.
3. Only after the write succeeds does it reply **`ack`**. Alice's app shows one tick (*sent*).
4. It looks up Bob in the **session registry**. If he's online on gateway 2, it forwards the message there, and gateway 2 pushes it down Bob's socket.
5. Bob's app replies `receipt delivered`, and Alice sees two ticks. When Bob opens the chat, a `read` receipt follows.
6. If Bob is **offline**, the message is already stored; the push service sends a notification, and Bob fetches it on reconnect.

{% callout "tip", "Why persist before acknowledging" %}
If the server acknowledges first and crashes before writing, Alice believes the message was sent but it's lost. Persisting first, then acknowledging, means an acknowledged message is never lost. That's the "no message loss" requirement.
{% endcallout %}

### Delivery guarantees and duplicates

Networks drop acknowledgements, so the client **retries** unacknowledged sends: **at-least-once** delivery. To avoid duplicates, the server keeps a short-lived record of `client_msg_id`s per conversation; a retry with a known ID returns the original `ack` instead of storing again. Recipients dedupe by `message_id` too.

### Ordering

- A global clock order is impossible to guarantee, but **per-conversation order** is what users notice.
- Assign a **monotonically increasing `seq` per conversation**, for example an atomic counter in the conversation's partition, or by routing all writes for a conversation through one owner (consistent hashing on `conversation_id`).
- Clients display by `seq`, and can detect gaps (seq 41 then 43 means "fetch 42").

### Offline and multi-device sync

Each **device** stores the last `seq` it has seen per conversation (or a global cursor). On reconnect it calls `GET /sync?since_cursor=…` and gets everything newer. Delivered and read state is per device too. This is a simple, robust model: the message store is the source of truth and devices catch up from it.

### Group chats: fan-out

- **Write once, read by many**: store each group message once in the conversation's partition, then *deliver* to each online member's gateway. For 500 members that's up to 500 gateway pushes. Do it asynchronously through a queue, so the sender gets an acknowledgement immediately.
- Look up members' sessions in **batches**; push to offline members only as notifications, rate-limited and collapsed ("12 new messages").
- Very large channels (100k members) work better **pull-based**: clients fetch on open instead of receiving every message pushed.

### Presence

- Online status comes from the WebSocket itself plus **heartbeats** (say every 30 s); missing heartbeats mean offline after a grace period, which avoids flicker on bad networks.
- Presence fan-out is expensive (each change × every contact). Mitigate: only send presence to users who **currently have the chat open** (subscribe on view), and batch updates.

### Scaling the gateway tier

- Gateways are **stateful** (they hold sockets) but do no business logic, so they're cheap to add.
- Use **least-connections** load balancing; on deploys, drain gateways gradually so clients reconnect smoothly with **backoff and jitter** (avoids a reconnect stampede).
- The session registry updates on connect and disconnect, with TTLs so crashed gateways' entries expire.

### Media and security

- Images and video: upload to [object storage](/topics/object-storage/) with pre-signed URLs; the message carries only the object key and a thumbnail.
- **End-to-end encryption** (the Signal protocol): the server routes and stores ciphertext it can't read. That affects features like server-side search, which is worth mentioning as a trade-off.

## 7. Bottlenecks and failure modes

| What fails | Impact | Mitigation |
|---|---|---|
| A gateway dies | ~50k users disconnect | Clients reconnect to another gateway (backoff + jitter) and sync from their cursor |
| Session registry stale | Messages routed to the wrong gateway | TTLs + heartbeats; gateway rejects unknown users → fall back to push |
| Message store partition slow | Sends delay | Replication; tune consistency (`QUORUM` writes); backpressure to clients |
| Push provider outage | Offline users not notified | Retry with backoff; messages are safe in storage and sync on next open |
| Huge group spam | Fan-out storm | Async fan-out queue, per-group rate limits, pull model for big channels |

## 8. Wrap-up

A strong answer: a gateway tier for WebSockets plus a session registry; **persist then acknowledge**; per-conversation sequence numbers; client message IDs for idempotent retries; cursor-based multi-device sync; a deliberate group fan-out strategy; and push notifications for offline users.

**Likely follow-ups:** How would you add message search (and how does E2E encryption limit it)? How do you delete a message for everyone? How would you support 100k-member channels? How do you keep the gateway tier from melting during a regional reconnect storm?
