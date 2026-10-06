---
title: Caching
order: 6
summary: Keep hot data in fast memory to cut latency and database load, and the strategies, eviction policies and failure modes (stampedes, stale data, hot keys) that come with it.
glance:
  - "A cache trades **freshness for speed**: memory reads take ~100 ns, while a database query takes milliseconds."
  - "**Cache-aside** (lazy loading) is the default; write-through and write-back trade write cost for freshness."
  - "Evict with **LRU** or LFU, and always set a **TTL** as a safety net for stale data."
  - "Watch for **stampedes** (many misses at once), **hot keys** and **cache penetration**."
---
A **cache** stores the result of an expensive operation so the next request can reuse it. With a read-heavy workload, a cache that serves 90% of reads cuts database load by 10× and makes those reads much faster.

## Where caches live

| Layer | Example | Notes |
|---|---|---|
| Client | Browser cache, app memory | Free and fastest; controlled by HTTP headers |
| Edge | [CDN](/topics/cdn/) | Static and cacheable content close to users |
| Application | In-process map | Very fast, but each server has its own copy |
| Distributed cache | Redis, Memcached | Shared by all app servers; the usual "cache" in a design |
| Database | Buffer pool, query cache | Built in; you tune rather than design it |

## Read strategies

{% diagram "Cache-aside: check the cache, fall back to the database, then fill the cache" %}
app: App server @ 0,1
cache: Cache\n(Redis) [cache] @ 2,0
db: Database [db] @ 2,2
app -> cache : 1. GET key
app -> db : 2. on miss: query
app --> cache : 3. SET key, TTL
{% enddiagram %}

- **Cache-aside (lazy loading)**: the app reads the cache; on a miss it reads the database and writes the result to the cache. Only requested data gets cached. A miss costs three trips, and data can go stale until the TTL expires. **This is the default choice.**
- **Read-through**: the cache itself loads from the database on a miss. Same idea, but the app code is simpler and the cache library is smarter.

## Write strategies

| Strategy | How it works | Pros | Cons |
|---|---|---|---|
| Write-through | Write to cache and DB together | Cache always fresh | Slower writes; caches data nobody reads |
| Write-back (write-behind) | Write to cache; flush to DB later | Very fast writes | **Data loss** if the cache dies before flushing |
| Write-around | Write to DB only; cache on read | No cache pollution | First read after a write is a miss |
| Invalidate on write | Write to DB, delete the cache key | Simple, avoids stale reads | Next read is a miss |

{% callout "tip", "A common, safe pattern" %}
Cache-aside for reads, plus **delete the key on write** (rather than updating it). Deleting avoids races where two concurrent writes leave the older value in the cache.
{% endcallout %}

## Eviction

Memory is limited, so something has to go:

- **LRU** (least recently used): evict what hasn't been touched longest. The default for most workloads.
- **LFU** (least frequently used): evict what's used least often. Better when popularity is stable.
- **FIFO** and random: simpler, occasionally good enough.
- **TTL** (time to live): expire entries after a set time, whatever the policy. It bounds how stale data can get.

## What goes wrong

- **Cache stampede (thundering herd)**: a hot key expires and thousands of requests miss at once and hammer the database. Fixes: **request coalescing** (one request refills, others wait), a lock per key, refreshing early before expiry, and **jittered TTLs** so keys don't all expire together.
- **Cache penetration**: requests for keys that don't exist always miss, possibly as an attack. Fixes: cache the "not found" result briefly, or put a **Bloom filter** in front.
- **Hot keys**: one key (a celebrity's profile) overloads one cache node. Fixes: replicate the hot key across nodes, or add a small in-process cache in front.
- **Stale data**: the cache and database disagree. Fixes: invalidate on write, short TTLs, or accept it if the product can tolerate a few seconds of staleness.
- **Cold start**: an empty cache after a restart sends everything to the database. Warm it up gradually.

{% procon %}
- Huge latency improvement for repeated reads
- Shields the database; you can often skip read replicas
- Cheap: memory is fast and commodity
---cons---
- Staleness: another copy of the truth to keep in sync
- New failure modes (stampede, penetration, hot keys)
- More infrastructure to run and monitor
- Little help for write-heavy or never-repeated reads
{% endprocon %}

{% callout "interview", "In the interview" %}
Justify the cache with numbers ("reads are 100× writes"), name the strategy (cache-aside), the eviction policy (LRU with a TTL) and how you invalidate, and mention one failure mode, usually the stampede. That sequence covers what most interviewers want to hear.
{% endcallout %}
