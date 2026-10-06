---
title: Rate limiting
order: 16
summary: Protect services from overload and abuse by capping requests per client. Covers the five classic algorithms, where to enforce limits, and doing it across many servers.
glance:
  - "Rate limiting caps how many requests a client (user, API key, IP) can make in a time window."
  - "**Token bucket** is the usual choice: it allows short bursts while enforcing an average rate."
  - "Enforce at the **API gateway**; keep counters in a shared store like **Redis** with atomic operations."
  - "Reply **429 Too Many Requests** with `Retry-After` and rate-limit headers."
---
Without limits, one buggy script or attacker can exhaust your servers for everyone. **Rate limiting** caps requests per client per time window and rejects or delays the excess. It protects availability, controls cost (each call to a paid API costs money), and enforces fair use between tenants.

{% diagram "Limits checked at the gateway, against counters shared by every gateway node" %}
c: Clients [client] @ 0,1
gw: API gateway\n+ rate limiter [lb] @ 1,1
redis: Redis\n(counters) [cache] @ 2,0
api: Services @ 3,1
c -> gw : request
gw <-> redis : check + count
gw -> api : allowed
gw --> c : 429 if over
{% enddiagram %}

## The algorithms

### Token bucket

A bucket holds up to **B tokens** and refills at **R tokens per second**. Each request takes one token; with no tokens left, it's rejected.

- Allows **bursts** up to B, while enforcing an average rate of R.
- Cheap: store only `(tokens, last_refill_time)` per client.
- Used by Amazon, Stripe and most API gateways. **The default answer.**

### Leaky bucket

Requests enter a FIFO queue that drains at a constant rate; when the queue is full, requests are dropped.

- Produces a perfectly **smooth output rate**, good for protecting a fragile downstream.
- No bursts, and a burst of requests waits in line, adding latency.

### Fixed window counter

Count requests per client per window (for example per minute); reject above the limit.

- Very simple: one counter per window.
- **Boundary problem**: a client can send the full limit at 12:00:59 and again at 12:01:00, which is 2× the limit in two seconds.

### Sliding window log

Keep a timestamp per request; count those in the last N seconds.

- Exact, with no boundary problem.
- Memory-hungry: one entry per request.

### Sliding window counter

Combine the current and previous fixed windows, weighted by overlap: `count = current + previous × (1 − elapsed fraction)`.

- Close to exact, with tiny memory. A great practical compromise.

| Algorithm | Bursts | Memory | Accuracy |
|---|---|---|---|
| Token bucket | Allowed up to B | O(1) | Good |
| Leaky bucket | Smoothed out | O(queue) | Good |
| Fixed window | 2× at edges | O(1) | Poor at boundaries |
| Sliding log | No | O(requests) | Exact |
| Sliding window counter | Mostly no | O(1) | Very good |

## Where to enforce

- **Client side**: polite, but can't be trusted.
- **API gateway / edge**: the usual place. It's central and stops traffic before it costs anything.
- **Per service**: protects a specific expensive dependency.

## Distributed rate limiting

With many gateway nodes, counters must be shared:

- Store counters in **Redis**, and update them **atomically** (`INCR` with `EXPIRE`, or a Lua script for a token bucket) to avoid race conditions between nodes.
- For very high scale, use a **local limit per node plus periodic sync**, accepting slight over-admission in exchange for no network call per request.
- Decide what happens if Redis is down: **fail open** (allow traffic, which favours availability) or **fail closed** (block, which favours protection).

## Telling clients

Return **`429 Too Many Requests`** with `Retry-After`, plus headers like `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`, so well-behaved clients back off.

{% procon %}
- Protects availability against abuse and bugs
- Enforces fair use and paid tiers
- Controls cost of expensive operations
---cons---
- Shared counters add latency and a dependency
- Badly tuned limits block legitimate users
- Limits by IP are unfair to shared IPs (offices, carriers)
{% endprocon %}

{% callout "interview", "In the interview" %}
This is also a full [practice question](/practice/rate-limiter/). The strong answer names token bucket (with a reason), enforces at the gateway, uses Redis with atomic Lua scripts, and states the fail-open versus fail-closed decision.
{% endcallout %}
