---
title: Design a notification system
navTitle: Notification system
order: 8
difficulty: Medium
summary: Send push, SMS and email notifications for many services, reliably and without spamming users. Tests queues per channel, retries with idempotency, preferences and third-party providers.
cards: notification-system
glance:
  - "A single **notification API** for every service; **separate queues and workers per channel** (push, SMS, email)."
  - "Check **user preferences**, opt-outs and **rate limits** before sending."
  - "Retries are inevitable, so dedupe with an **idempotency key** per notification."
  - "**Priorities**: one-time passwords must never wait behind a marketing blast."
---
## 1. Clarify requirements

{% callout "think", "Thinking out loud" %}
"This is mostly about reliability and not annoying users. I'll ask which channels, who triggers notifications, whether they can be scheduled, and what the delivery guarantees are, because 'send exactly once' over third-party providers needs careful design."
{% endcallout %}

**Functional**

- Channels: **mobile push** (iOS/Android), **SMS**, **email**.
- Any internal service can trigger a notification for one user or many (a campaign).
- **User preferences**: opt-outs per channel and per category; quiet hours.
- **Templates** with localisation; **scheduling** ("send at 9 am local time").
- Track **status**: sent, delivered, opened, failed.

**Non-functional**

- **Reliable**: never silently drop a notification (at-least-once), and avoid visible duplicates.
- Soft real-time: transactional messages within seconds.
- Handle spikes: marketing campaigns to millions.
- Scale: ~**10M notifications/day** on average, bursts of **millions in minutes**.

## 2. Estimates

- 10M/day ≈ **~100/s** average; campaigns push bursts to **10k+/s**, so a queue must absorb spikes.
- Providers have **rate limits** (for example SMS throughput per sender number), so our sending rate is often capped by them, not by us.
- Notification log: 10M × ~1 KB ≈ **10 GB/day**, kept for a few months.

## 3. API

```
POST /v1/notifications
{
  "idempotency_key": "order-8812-shipped",
  "user_ids": ["u_42"],                  (or "segment": "inactive_30d")
  "template": "order_shipped",
  "data": { "order_id": "8812", "eta": "Tue" },
  "channels": ["push", "email"],         (optional; default from template)
  "priority": "high",                    (high = transactional, low = marketing)
  "send_at": "2026-10-07T09:00:00"       (optional; local time)
}
→ 202 Accepted { notification_id }
```

`202 Accepted`, not `200`: the work happens asynchronously.

## 4. Data model

| Data | Store |
|---|---|
| Devices `(user_id, device_token, platform, last_seen)` | SQL / KV |
| Preferences `(user_id, category, channel, enabled, quiet_hours, timezone)` | SQL + cache |
| Templates `(name, locale, channel, body)` | SQL + cache |
| Notification log `(notification_id, user_id, channel, status, timestamps)` | Wide-column / time-series store |
| Idempotency keys | Redis with a TTL (e.g. 24 h) |

## 5. High-level design

{% diagram "One API, preference checks, then isolated per-channel queues and workers" %}
svc: Internal\nservices @ 0,1
api: Notification\nAPI @ 1,1
pref: Preferences\n+ templates [cache] @ 1,2.2
qp: Push queue [queue] @ 2,0
qs: SMS queue [queue] @ 2,1
qe: Email queue [queue] @ 2,2
wp: Push workers [worker] @ 3,0
ws: SMS workers [worker] @ 3,1
we: Email workers [worker] @ 3,2
apns: APNs / FCM [ext] @ 4,0
sms: SMS provider [ext] @ 4,1
email: Email provider [ext] @ 4,2
svc -> api
api -> pref : allowed?
api -> qp
api -> qs
api -> qe
qp --> wp
qs --> ws
qe --> we
wp -> apns
ws -> sms
we -> email
{% enddiagram %}

1. A service calls the API. It validates the request, checks the **idempotency key**, and records the notification.
2. It resolves recipients, checks **preferences, opt-outs, quiet hours and per-user rate limits**, and renders the **template**.
3. It enqueues one message per (user, channel) onto that channel's queue.
4. Channel workers call the provider (APNs/FCM, an SMS gateway, an email service) and record the result.
5. Provider **callbacks and webhooks** (delivered, bounced, opened) update the log.

## 6. Deep dives

### Why separate queues per channel

**Isolation** (a [bulkhead](/topics/reliability/)): if the SMS provider is slow or down, SMS messages back up in their own queue while push and email keep flowing. Each channel scales its workers independently and respects its own provider rate limits.

### Priorities

Separate **high** (password resets, one-time codes, security alerts) from **low** (marketing) into different queues or topics, with dedicated workers. A ten-million-user campaign must never delay someone's login code.

### Reliability: retries without duplicates

- Workers acknowledge a queue message **only after** the provider accepts it, giving at-least-once delivery.
- Transient provider errors: **retry with exponential backoff and jitter**. After N attempts, send to a **dead-letter queue** and alert.
- Duplicates come from retries, and from workers crashing after sending but before acknowledging. Mitigations:
  - **Idempotency key** at the API (dedupe repeated requests from services).
  - A **per-message send record** checked before sending (`notification_id + channel` → sent?).
  - Providers that support their own idempotency keys or collapse IDs (APNs `apns-collapse-id`).
- Truly exactly-once delivery to a phone isn't achievable across third parties. Aim for **effectively once**, and make duplicates harmless.

### Preferences, rate limits and quiet hours

- Check opt-outs **at send time** (preferences can change between scheduling and sending).
- Per-user caps such as "at most 3 marketing pushes a day" (see [rate limiting](/topics/rate-limiting/)).
- **Quiet hours** and **scheduling** in the user's time zone: hold messages in a **delay queue** (or a scheduler table polled by a job) until the send time.
- Legal requirements: unsubscribe links in email, SMS opt-out keywords (STOP).

### Provider failover

Keep two providers per channel where possible (two SMS gateways, two email services). A circuit breaker on each fails over automatically when error rates rise.

### Device tokens

Push tokens expire or change. Update them whenever the app starts, and delete them when the provider reports "unregistered", so you don't keep sending to dead devices.

## 7. Bottlenecks and failure modes

| What fails | Impact | Mitigation |
|---|---|---|
| Provider outage | One channel stalls | Per-channel queues; failover provider; retries with backoff |
| Campaign spike | Queues back up | Low priority queue; autoscale workers; throttle to provider limits |
| Worker crash mid-send | Possible duplicate | Send records + idempotency; collapse IDs |
| Bad template deploy | Broken messages to millions | Template validation, preview, staged rollout |
| Preference service down | Can't verify consent | Cached preferences; fail closed for marketing, open for critical security alerts |

## 8. Wrap-up

A strong answer: one async API (`202`), preference and rate checks before sending, **per-channel queues** (isolation) and **priority separation**, retries with backoff and DLQs, idempotency for duplicates, scheduling via delay queues, and provider failover.

**Likely follow-ups:** How would you send to 50M users at once without overwhelming providers? How do you build analytics (open rates per template)? How would you add in-app notifications (a per-user inbox plus real-time delivery over WebSockets)?
