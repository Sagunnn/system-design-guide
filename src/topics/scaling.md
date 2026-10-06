---
title: "Scaling: vertical vs horizontal"
navTitle: Scaling basics
order: 4
summary: Two ways to handle more load (a bigger machine or more machines), why horizontal scaling needs stateless servers, and where state should live instead.
glance:
  - "**Vertical** = a bigger machine. Simple, but there's a ceiling and a single point of failure."
  - "**Horizontal** = more machines behind a load balancer. Near-unlimited, but needs stateless services."
  - "Move session state out of app servers, into a shared store like Redis or into signed tokens."
  - "Scale the stateless tier first; the database is usually the hard part."
---
Every popular system eventually outgrows one machine. There are two ways to respond, and real systems use both.

## Vertical scaling (scale up)

Give the machine more CPU, RAM or faster disks.

{% procon %}
- No code changes: the simplest option by far
- No distributed-systems problems (no network splits, no consistency issues)
- Great for databases early on: one big box goes a long way
---cons---
- Hard ceiling: the largest machine available
- Cost grows faster than capacity at the high end
- Still a **single point of failure**
- Upgrades often mean downtime
{% endprocon %}

## Horizontal scaling (scale out)

Add more machines and spread the load across them with a [load balancer](/topics/load-balancing/).

{% diagram "Horizontal scaling: identical stateless servers, state kept elsewhere" %}
c: Clients [client] @ 0,1
lb: Load balancer [lb] @ 1,1
a1: App server 1 @ 2,0
a2: App server 2 @ 2,1
a3: App server 3 @ 2,2
sess: Session store\n(Redis) [cache] @ 3,0.5
db: Database [db] @ 3,1.8
c -> lb
lb -> a1
lb -> a2
lb -> a3
a1 -> sess
a2 -> sess
a2 -> db
a3 -> db
{% enddiagram %}

{% procon %}
- Practically unlimited capacity: add commodity machines
- Fault tolerant: lose one server and the rest carry on
- Scale up and down with demand (autoscaling)
---cons---
- Needs a load balancer and **stateless** servers
- Distributed-systems complexity: partial failures, consistency
- Data tiers are much harder to scale out than app tiers
{% endprocon %}

## Stateless services: the key to scaling out

A server is **stateless** if any instance can handle any request, so nothing about a user lives only in one server's memory. If server 2 holds Alice's session and dies, Alice is logged out. Worse, the load balancer must keep sending her to server 2 ("sticky sessions"), which spreads load unevenly.

Where state goes instead:

- **Shared session store**: Redis or Memcached, keyed by session ID.
- **Client-side tokens**: a signed JWT carries the user's identity, so the server checks the signature and needs no lookup. The cost is that revoking a token before it expires needs extra work, like a deny-list or short lifetimes.
- **Databases and object storage**: for anything durable, like uploads or carts.

Once servers are stateless you can **autoscale**: add instances when CPU or request rate rises, and remove them when it falls.

## Scaling the data tier

App servers are easy; data is hard. In rough order:

1. **Vertical scaling** of the database. Often enough for a long time.
2. **[Caching](/topics/caching/)** to absorb repeated reads.
3. **[Read replicas](/topics/replication/)** to spread reads.
4. **[Sharding](/topics/sharding/)** to spread writes and data across machines. Powerful, but complex.

{% callout "think", "Thinking out loud" %}
"At 2k QPS I'd start with a few stateless app servers behind a load balancer and one well-sized Postgres. I'll only reach for sharding if the write rate or data size outgrows a single primary, which our estimates say happens around year two."
{% endcallout %}

{% callout "interview", "In the interview" %}
Say the word *stateless* early and explicitly. Interviewers listen for it, because it shows you know why horizontal scaling works.
{% endcallout %}
