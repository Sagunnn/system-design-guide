---
title: API design and real-time communication
navTitle: APIs & real-time
order: 15
summary: REST, gRPC and GraphQL compared; pagination, idempotency and versioning; and how servers push updates with long polling, SSE, WebSockets and webhooks.
glance:
  - "**REST** for public APIs, **gRPC** for fast internal service-to-service calls, **GraphQL** when clients need flexible queries."
  - "Use **cursor pagination** for feeds; offset pagination breaks on large or changing lists."
  - "Make retried writes safe with **idempotency keys**."
  - "For server push: **WebSockets** (two-way), **SSE** (one-way), long polling (fallback), **webhooks** (server to server)."
---
## API styles

| | REST | gRPC | GraphQL |
|---|---|---|---|
| Shape | Resources and HTTP verbs (`GET /users/42`) | Remote procedure calls from a `.proto` schema | One endpoint; the client describes the data it wants |
| Format | JSON (usually) | Protocol Buffers (binary) | JSON |
| Strengths | Simple, cacheable, universal | Fast, typed, streaming, code generation | No over- or under-fetching; one round trip for nested data |
| Weaknesses | Over-fetching, many round trips | Not browser-native; harder to debug | Caching is harder; costly queries need limits |
| Best for | Public APIs, CRUD | Internal microservices | Mobile and web clients with varied screens |

## Designing good endpoints

- **Nouns and verbs**: `POST /tweets`, `GET /tweets/{id}`, `DELETE /tweets/{id}`, `GET /users/{id}/timeline`.
- **Pagination**:
  - *Offset* (`?page=3&size=20`) is simple, but slow deep in a list, and items shift when new ones are inserted.
  - *Cursor* (`?after=<opaque cursor>&limit=20`) is stable and fast, which suits feeds and infinite scroll.
- **Idempotency**: `GET`, `PUT` and `DELETE` should be idempotent. For `POST`, accept an `Idempotency-Key` header. The server stores the result per key, so a retried "charge card" request doesn't charge twice.
- **Versioning**: `/v1/…` in the path, or a header. Never break existing clients.
- **Errors**: correct status codes (`400`, `401`, `404`, `409`, `429`, `5xx`) plus a machine-readable body.
- **Rate limits and auth**: API keys or OAuth tokens, plus [rate limiting](/topics/rate-limiting/) with `429` and `Retry-After`.

## Real-time: getting updates to clients

{% diagram "WebSockets at scale: connection gateways plus a pub/sub layer to reach the right user" %}
u1: Alice\n(app) [client] @ 0,0
u2: Bob\n(app) [client] @ 0,2
g1: WS gateway 1 [lb] @ 1,0
g2: WS gateway 2 [lb] @ 1,2
ps: Pub/sub\n(Redis, Kafka) [queue] @ 2,1
svc: Chat service @ 3,1
u1 <-> g1 : WebSocket
u2 <-> g2 : WebSocket
g1 -> svc : message
svc -> ps : publish
ps --> g2 : to Bob's gateway
{% enddiagram %}

| Technique | How | Direction | Good for |
|---|---|---|---|
| **Short polling** | Client asks every few seconds | Client pulls | Simple dashboards; wasteful at scale |
| **Long polling** | Server holds the request open until there's data or a timeout | Server push (emulated) | Fallback where WebSockets fail |
| **Server-Sent Events (SSE)** | One long HTTP response streams events | Server → client | Live scores, notifications, LLM token streams |
| **WebSockets** | Persistent full-duplex TCP connection | Both ways | Chat, multiplayer games, collaborative editing |
| **Webhooks** | Your server calls *their* URL when something happens | Server → server | Payment events, Git pushes |

{% procon "WebSockets", "SSE and long polling" %}
- True two-way, low-latency messaging
- One connection per client, little overhead per message
- Stateful connections are harder to load-balance and scale
- Needs a gateway tier and a way to route to the right connection
---cons---
- SSE is plain HTTP: works through proxies, auto-reconnects
- SSE is one-way only (the client sends via normal requests)
- Long polling works everywhere but costs a request per message
- Both are simpler to run than WebSockets for one-way updates
{% endprocon %}

{% callout "think", "Thinking out loud" %}
"Chat needs both directions and low latency, so WebSockets. Each gateway holds tens of thousands of connections. A presence service maps user → gateway, and pub/sub delivers a message to whichever gateway Bob is connected to. If Bob's offline, we fall back to a push notification."
{% endcallout %}

{% callout "interview", "In the interview" %}
Write the API before the architecture: three to five endpoints with the important parameters. It surfaces requirements (pagination, idempotency, auth) and gives the interviewer something concrete to probe.
{% endcallout %}
