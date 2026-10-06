---
title: Sharding (partitioning)
navTitle: Sharding
order: 11
summary: Split a dataset across many machines so writes and storage scale out. Covers range, hash and directory sharding, choosing a shard key, hotspots and resharding.
glance:
  - "Sharding splits data **across machines**; each shard holds a subset of rows. Replication copies it; sharding divides it."
  - "**Range** sharding keeps order (good scans, risky hotspots); **hash** sharding spreads load evenly (no range scans)."
  - "The **shard key** is the big decision: high cardinality, even load, and the key most queries filter by."
  - "Costs: cross-shard queries and joins, distributed transactions, and resharding."
---
When one database can't hold all the data or absorb all the writes, you **shard**: split the data horizontally into pieces (shards or partitions), each living on a different machine. Each shard is usually [replicated](/topics/replication/) as well.

{% diagram "A router sends each request to the shard that owns its key" %}
app: App server @ 0,1
router: Shard router\n(or client library) [lb] @ 1,1
s1: Shard 1\nusers A–H [db] @ 3,0
s2: Shard 2\nusers I–Q [db] @ 3,1
s3: Shard 3\nusers R–Z [db] @ 3,2
app -> router : user_id
router -> s1
router -> s2
router -> s3
{% enddiagram %}

## Sharding strategies

### Range-based

Each shard owns a contiguous range of keys (A–H, I–Q…, or by date).

{% procon %}
- Range queries stay on one shard (`orders in March`)
- Easy to reason about and to split a range
---cons---
- **Hotspots**: sequential keys (timestamps, auto-increment IDs) send all new writes to the last shard
- Uneven sizes unless ranges are rebalanced
{% endprocon %}

### Hash-based

Shard = `hash(key) mod N`, or better, [consistent hashing](/topics/consistent-hashing/).

{% procon %}
- Spreads keys and load evenly
- No hotspot from sequential keys
---cons---
- Range queries must ask every shard
- With plain `mod N`, changing N remaps almost every key, so use consistent hashing
{% endprocon %}

### Directory-based

A lookup service maps each key (or tenant) to a shard.

{% procon %}
- Fully flexible: move a big tenant to its own shard
- Easy rebalancing by updating the map
---cons---
- The directory is an extra hop and must be highly available
- Another component to keep consistent
{% endprocon %}

**Geo-sharding**, splitting by region, is a variant: users' data lives near them, which helps latency and data-residency laws.

## Choosing a shard key

A good shard key:

- **Has high cardinality**: many distinct values, so data can spread out.
- **Spreads load evenly**: no single value gets most of the traffic.
- **Matches the main query**: most requests can be answered by **one** shard.

| Example | Good key | Why |
|---|---|---|
| Chat messages | `conversation_id` | A conversation is read together; there are many conversations |
| Multi-tenant SaaS | `tenant_id` | Queries stay within a tenant (watch for one giant tenant) |
| Time-series metrics | `(metric_id, time bucket)` | Hashing the metric avoids an "all writes to now" hotspot |

{% callout "warn", "Celebrity / hot keys" %}
Even a good key can get one huge value: a celebrity's followers, or a viral post. Mitigations: add a random suffix to spread a hot key over several shards (*salting*), cache it heavily, or treat it specially (see the [news feed](/practice/news-feed/) question).
{% endcallout %}

## What gets harder

- **Cross-shard queries**: "top 10 posts overall" must ask every shard and merge (*scatter–gather*).
- **Joins** across shards are slow, so denormalise, or co-locate related data with the same key.
- **Transactions** across shards need two-phase commit or a saga, so design so that most operations touch one shard.
- **Resharding**: moving data while serving traffic. Plan for it: use many small **virtual shards** mapped onto fewer machines, so growing means moving whole virtual shards rather than rehashing everything.
- **Unique IDs**: auto-increment no longer works across shards. See [unique IDs](/topics/unique-ids/).

{% callout "interview", "In the interview" %}
Only shard when the estimates demand it (writes or data size beyond one primary), name the shard key, and explain why it keeps the hot query on one shard. Then mention one hard consequence, usually hot keys or resharding.
{% endcallout %}
