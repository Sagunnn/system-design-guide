---
title: Design a distributed rate limiter
navTitle: Rate limiter
order: 2
difficulty: Medium
summary: Limit requests per user, API key or IP across a fleet of gateway servers with minimal added latency. Tests algorithms, atomicity in a shared store and failure trade-offs.
cards: rate-limiter-q
glance:
  - "Enforce at the **API gateway**, with counters in **Redis** shared by every gateway node."
  - "**Token bucket** for bursty APIs, sliding window counter for strict per-minute quotas."
  - "Use a **Lua script** so check-and-update is **atomic**, with no race between nodes."
  - "Decide **fail open vs fail closed** when Redis is unavailable."
---
## 1. Clarify requirements

{% callout "think", "Thinking out loud" %}
"Rate limiting can mean many things. I'll pin down what we're limiting by (user, API key, IP), whether limits differ per endpoint and plan, how accurate it must be, and what latency budget we have, because the limiter sits on every request."
{% endcallout %}

**Functional**

- Limit requests by **client identity** (API key, user ID or IP) and optionally per **endpoint**, for example 100 req/min for `/search` on the free plan.
- **Configurable rules** that change without a deploy.
- Rejected requests get **`429`** with headers telling the client when to retry.

**Non-functional**

- **Low overhead**: under ~1–2 ms added per request.
- **Distributed**: correct across 50+ gateway nodes, not per node.
- **Highly available**: the limiter must never become the reason the API is down.
- **Reasonably accurate**: a little over-admission under races is acceptable; large errors aren't.
- Scale: **1 million requests/s** at peak across the fleet; ~**10 million** active clients.

## 2. Estimates

- 1M checks/s → each check is one round trip to the counter store. Redis handles ~100k simple ops/s per core, so a **sharded Redis cluster of ~20 primaries** is comfortable, with headroom.
- Memory: 10M clients × a few rules × ~50 bytes ≈ **1–2 GB**. Small.
- Latency: a same-zone Redis round trip is ~0.5 ms, which fits the budget.

## 3. API

Internal interface, called by gateway middleware:

```
allow(client_id, rule_id) → { allowed: bool, remaining: int, reset_at: ts }
```

Responses to clients:

```
429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1735689600
```

Rules (from a config service, cached in each gateway):

```
- rule: search_free
  match: { path: /search, plan: free }
  limit: 100 per 60s
  algorithm: token_bucket   # burst 20
```

## 4. Data model

One Redis key per (rule, client):

- Token bucket: `rl:{rule}:{client}` → hash `{tokens, last_refill_ms}`, with a TTL so idle keys disappear.
- Sliding window counter: `rl:{rule}:{client}:{window_start}` → integer counts for the current and previous window.

## 5. High-level design

{% diagram "Gateway middleware checks a sharded Redis; rules come from a config service" %}
c: Clients [client] @ 0,1
gw: API gateway\n+ limiter [lb] @ 1,1
redis: Redis cluster\n(counters) [cache] @ 2,0
cfg: Rules config\nservice [ext] @ 2,2
svc: Backend\nservices @ 3,1
c -> gw
gw <-> redis : Lua: check + take
cfg --> gw : rules (cached)
gw -> svc : allowed
{% enddiagram %}

1. A request arrives at any gateway node. The middleware identifies the client and matches the rules.
2. It runs **one atomic Redis script** that updates the counter and returns allowed or denied.
3. If allowed, the request is forwarded; otherwise the gateway returns `429` with headers.

## 6. Deep dives

### Choosing the algorithm

{% procon "Token bucket", "Sliding window counter" %}
- Allows short **bursts** up to the bucket size, enforces an average rate
- O(1) state: token count + last refill time
- Best for APIs where clients batch requests
---cons---
- Approximates a true rolling window by weighting the previous window
- O(1) state: two counters
- Best for strict quotas like "100 per minute" with no edge spikes
{% endprocon %}

Avoid the plain **fixed window** (it allows 2× the limit at window boundaries) and the **sliding log** (memory grows with traffic). See [rate limiting](/topics/rate-limiting/) for all five.

### Atomicity: avoiding races

Two gateway nodes reading "5 tokens left" and both writing "4" would admit an extra request. A naive *read → compute → write* is racy. Fix: do it **inside Redis in one step**, with a **Lua script**, which Redis runs atomically:

```lua
-- KEYS[1]=bucket  ARGV: capacity, refill_per_ms, now_ms
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or tonumber(ARGV[1])
local ts = tonumber(b[2]) or tonumber(ARGV[3])
tokens = math.min(tonumber(ARGV[1]), tokens + (ARGV[3] - ts) * ARGV[2])
local allowed = tokens >= 1
if allowed then tokens = tokens - 1 end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', ARGV[3])
redis.call('PEXPIRE', KEYS[1], 120000)
return { allowed and 1 or 0, math.floor(tokens) }
```

For fixed or sliding windows, `INCR` plus `EXPIRE` in a script works the same way.

### Scaling the counter store

- Shard Redis by key (Redis Cluster hashes keys to slots), so one client's counter always lives on one shard.
- Replicas give failover. A brief inaccuracy after failover is acceptable for rate limiting.
- **Hot clients** (one key doing huge volume) concentrate on one shard. Mitigate with a **local pre-limiter**: each gateway admits up to its share (for example limit ÷ number of nodes) locally and only consults Redis near the threshold.

### Lowering latency further

- Co-locate Redis in the same zone as the gateways.
- **Pipeline** checks, or check asynchronously and **allow optimistically** for low-risk rules, correcting on the next request.
- For very high volume, use **local counters synced every ~100 ms**, accepting slight over-admission.

### Fail open or fail closed?

If Redis is unreachable:

- **Fail open** (allow): the API stays up and limits are temporarily lost. Usually right for general APIs.
- **Fail closed** (deny): protects expensive or abuse-prone endpoints (login attempts, SMS sending) at the cost of availability.

Make it **per rule**, and keep a local in-memory fallback limiter so you're never completely unprotected.

### Multi-region

Either give each region its own limits (simple; a global client gets N × the limit) or sync counts between regions asynchronously (closer to a global limit, with some lag). Strict global limits need a central store, which adds cross-region latency, and that's rarely worth it.

## 7. Bottlenecks and failure modes

| What fails | Impact | Mitigation |
|---|---|---|
| Redis shard down | Checks fail for its keys | Replica failover; fail open or closed per rule; local fallback |
| Network latency spike | Slower requests | Timeouts on the check (a few ms) → fall back to the local limiter |
| Hot client | One shard overloaded | Local pre-limiting, key splitting |
| Bad rule pushed | Legitimate users blocked | Validate rules, roll out gradually, run in "log-only" mode first |

## 8. Wrap-up

A strong answer: the gateway as the enforcement point; token bucket (or sliding window counter) with a reason; atomic Lua scripts in sharded Redis; clear client headers; and an explicit fail-open versus fail-closed decision.

**Likely follow-ups:** How would you rate-limit by IP behind a carrier's NAT? How would you add per-tenant quotas billed monthly (durable counters, not Redis TTLs)? How would you test the limiter (load tests, shadow mode)?
