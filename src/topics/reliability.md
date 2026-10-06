---
title: "Reliability: timeouts, retries, circuit breakers and idempotency"
navTitle: Reliability patterns
order: 19
summary: The patterns that keep a distributed system up when its parts fail. Covers redundancy, timeouts, retries with backoff and jitter, circuit breakers, bulkheads, idempotency, graceful degradation and observability.
glance:
  - "Assume everything fails: remove **single points of failure** with redundancy and failover."
  - "Every network call needs a **timeout**; retry with **exponential backoff + jitter**, and only idempotent operations."
  - "**Circuit breakers** stop hammering a failing dependency; **bulkheads** stop one failure from sinking everything."
  - "Measure with **SLOs** and the golden signals: latency, traffic, errors, saturation."
---
At scale, something is always broken: a disk, a node, a network link, a deploy. Reliable systems don't avoid failure; they **contain** it. These patterns come up in almost every deep dive.

## Redundancy and failover

- **No single points of failure (SPOFs)**: run at least two of everything (load balancers, app servers, databases with replicas), spread across **availability zones**.
- **Failover**: active–passive (a standby takes over) or active–active (all serve traffic).
- **Availability math**: two independent components *in series* at 99.9% give 99.8%; two *in parallel* give 99.9999%. Redundancy multiplies; dependencies divide.

| Availability | Downtime per year |
|---|---|
| 99% ("two nines") | ~3.65 days |
| 99.9% | ~8.8 hours |
| 99.99% | ~53 minutes |
| 99.999% | ~5 minutes |

## Timeouts and retries

- **Always set timeouts.** Without one, a slow dependency ties up your threads until you go down too.
- **Retry transient failures**, but with **exponential backoff** (100 ms, 200 ms, 400 ms…) and **jitter** (randomness), so thousands of clients don't retry in lockstep.
- **Cap retries** and add a retry budget. Retries multiply load exactly when a system is already struggling, which causes *retry storms*.
- **Only retry idempotent operations**, or make them idempotent (below).

## Circuit breakers

{% diagram "Circuit breaker states: stop calling a failing dependency, then test it carefully" %}
closed: Closed\n(calls pass) [cdn] @ 0,1
open: Open\n(fail fast) [cache] @ 2,0
half: Half-open\n(trial calls) [lb] @ 2,2
closed -> open : failures > threshold
open -> half : after cool-down
half -> closed : trial succeeds
half -> open : trial fails
{% enddiagram %}

When a dependency keeps failing, a **circuit breaker** "opens" and fails calls immediately, often returning a fallback, instead of waiting on timeouts. After a cool-down it lets a few trial calls through (**half-open**). If they succeed it closes; if not, it opens again. This protects both you and the struggling service.

## Bulkheads

Like the watertight compartments of a ship: give each dependency its own **thread pool or connection pool**, so a slow recommendation service can't use up the threads your checkout flow needs.

## Idempotency

An operation is **idempotent** if doing it twice has the same effect as doing it once. With retries and at-least-once [queues](/topics/message-queues/), duplicates *will* happen, so:

- Use **idempotency keys** on writes (the server stores the result per key and replays it).
- Prefer absolute updates (`SET status = 'shipped'`) to relative ones (`count = count + 1`).
- Dedupe events by ID in consumers.

## Graceful degradation

When parts fail, serve a reduced experience rather than an error page: show cached or stale data, hide recommendations, queue writes for later, switch to read-only mode. Combine with **load shedding**: under overload, reject low-priority work early to protect the core.

## Observability

You can't fix what you can't see.

- **Metrics**, especially the four *golden signals*: **latency, traffic, errors, saturation**.
- **Logs**: structured, with request IDs.
- **Distributed traces**: follow one request across services.
- **SLIs and SLOs**: define "good" (for example 99.9% of requests under 300 ms), alert on burning through the **error budget**, and use that budget to decide between shipping features and fixing reliability.

{% procon %}
- Failures stay small and local
- Recovery is automatic and fast
- Users see degraded features, not outages
---cons---
- More moving parts and configuration
- Retries and failover can hide bugs, or cause storms if misconfigured
- Redundancy costs money (2–3× capacity)
{% endprocon %}

{% callout "interview", "In the interview" %}
In the wrap-up, walk the diagram box by box and ask "what if this dies?". Answer with replicas, failover, timeouts, retries with backoff, a circuit breaker on the flaky dependency, and what the user sees meanwhile. It's the fastest way to show senior-level thinking.
{% endcallout %}
