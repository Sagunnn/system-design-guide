---
title: Load balancing
order: 5
summary: How load balancers spread traffic across servers, the difference between layer 4 and layer 7, the main algorithms, and how to keep the balancer itself from becoming a single point of failure.
glance:
  - "A load balancer spreads requests across healthy servers and removes dead ones via **health checks**."
  - "**L4** balances TCP/UDP connections (fast, blind to content); **L7** understands HTTP (routes by path, header, cookie)."
  - "Algorithms: round robin, weighted, **least connections**, IP/consistent hashing."
  - "Run balancers in pairs (active–passive or active–active) so they aren't a single point of failure."
---
A **load balancer (LB)** sits between clients and a pool of servers. It decides which server handles each request, stops sending traffic to unhealthy servers, and lets you add or remove servers without clients noticing.

{% diagram "A redundant load balancer pair in front of a pool with health checks" %}
users: Users [client] @ 0,1
lb1: LB (active) [lb] @ 1,0.5
lb2: LB (standby) [lb] @ 1,1.5
s1: Server A @ 3,0
s2: Server B @ 3,1
s3: Server C\n(unhealthy) [ext] @ 3,2
users -> lb1 : virtual IP
lb1 -- lb2 : heartbeat
lb1 -> s1
lb1 -> s2
lb1 --> s3 : health check fails
{% enddiagram %}

## What a load balancer does

- **Distributes load** using an algorithm (below).
- **Health checks**: pings each server (say `GET /health` every 5 s) and removes it after a few failures.
- **TLS termination**: decrypts HTTPS once at the edge so servers don't have to.
- **Connection management**: keeps long-lived connections to backends; can buffer slow clients.
- **Zero-downtime deploys**: drain a server, update it, add it back.

## Layer 4 vs layer 7

{% procon "Layer 4 (transport)", "Layer 7 (application)" %}
- Routes by IP and port; never reads the request body
- Very fast, very cheap, handles any TCP/UDP protocol
- Can't route by URL path or cookie
- Examples: AWS NLB, LVS
---cons---
- Reads HTTP: routes `/api/*` and `/images/*` to different pools
- Can rewrite headers, retry, cache, compress, rate-limit
- More CPU per request; must terminate TLS to see content
- Examples: Nginx, Envoy, HAProxy, AWS ALB
{% endprocon %}

## Algorithms

| Algorithm | How it picks | Good for |
|---|---|---|
| Round robin | Next server in turn | Identical servers, similar requests |
| Weighted round robin | Bigger servers get more turns | Mixed server sizes |
| Least connections | Server with fewest open connections | Long or uneven requests (WebSockets, uploads) |
| Least response time | Fastest recent server | Latency-sensitive pools |
| IP hash | Hash of client IP | Simple stickiness |
| Consistent hashing | Hash of a key onto a ring | Caches and shards: the same key goes to the same node ([details](/topics/consistent-hashing/)) |

{% callout "warn", "Sticky sessions" %}
Pinning a user to one server ("session affinity") makes stateful apps work, but it causes uneven load and lost sessions when that server dies. Prefer [stateless servers](/topics/scaling/) and use stickiness only when you must, for example for WebSocket connections.
{% endcallout %}

## Keeping the balancer available

A single load balancer is a single point of failure. Common fixes:

- **Active–passive pair** sharing a virtual IP; the standby takes over when heartbeats stop.
- **Active–active** behind DNS or anycast, both serving traffic.
- **Managed cloud balancers**, which are redundant by design.

## Global load balancing

For multiple regions, **GeoDNS** returns the nearest region's address, and **anycast** advertises one IP from many locations so the network routes users to the closest one. Global balancing also gives you **regional failover**: if a region goes down, DNS stops pointing users at it.

{% procon %}
- Horizontal scaling and fault tolerance in one component
- Hides topology; servers can change freely
- Central place for TLS, routing and rate limits
---cons---
- Another hop, so a little added latency
- Must itself be redundant
- L7 balancers need care: timeouts, retries, buffering
{% endprocon %}

{% callout "interview", "In the interview" %}
Draw the load balancer as soon as you have more than one server, mention health checks, and pick an algorithm with a reason: "least connections, because chat connections are long-lived and uneven."
{% endcallout %}
