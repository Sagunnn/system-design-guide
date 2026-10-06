---
title: Design search autocomplete (typeahead)
navTitle: Search autocomplete
order: 9
difficulty: Medium
summary: Suggest the top completions as someone types, in under 100 ms, for billions of queries a day. Tests tries with precomputed top-k, offline data pipelines and aggressive caching.
cards: typeahead
glance:
  - "Serve from an **in-memory trie** where every node stores its **precomputed top-k** completions."
  - "Build the trie **offline** from query logs (batch job), then load snapshots into servers."
  - "Shard by **prefix**, splitting popular prefixes further, and replicate for read throughput."
  - "Cut traffic with **client debouncing** and **caching** (browser and CDN) of short prefixes."
---
## 1. Clarify requirements

{% callout "think", "Thinking out loud" %}
"Autocomplete is a read-latency problem: results have to appear between keystrokes. I'll ask how fresh suggestions must be, because real-time trending versus daily updates is a big design difference, and whether results are personalised."
{% endcallout %}

**Functional**

- As the user types a prefix, return the **top 5–10 suggestions**, ranked by popularity.
- Suggestions come from **past search queries** (not from documents).
- Filter offensive and unsafe suggestions.
- Extensions: personalisation, trending topics, spelling tolerance.

**Non-functional**

- **Very low latency**: < 100 ms end to end, since users type ~5 characters a second.
- Highly available; slightly stale suggestions are fine (hourly or daily updates).
- Scale: **500M searches/day**; assume ~10 autocomplete requests per search after debouncing → **5B requests/day**.

## 2. Estimates

- Requests: 5B ÷ 10⁵ ≈ **50k/s** average, ~**150k/s** peak. Heavy reads, so in-memory serving with replicas.
- Data: unique queries are long-tailed. Keep the **top ~100M queries** (frequency above a threshold). Average 20 characters → raw strings ~2 GB; a trie with precomputed top-k lists is maybe **tens of GB**: big, but shardable and fine in memory.
- Updates: rebuilt from logs **daily** (or hourly), so the write path is batch, not online.

## 3. API

```
GET /v1/suggest?q=how%20to%20bo&limit=8&lang=en
→ 200 { "suggestions": ["how to boil eggs", "how to book a flight", …] }
Cache-Control: public, max-age=300
```

## 4. Data structure: a trie with top-k at each node

A **trie** (prefix tree) has one node per character, so the path spells a prefix. A naive lookup walks to the prefix node and then searches its whole subtree for the most popular completions: far too slow for a short prefix like "a".

The trick: **precompute and store the top-k completions at every node**.

- Lookup = walk *p* characters (p = prefix length) and return the stored list: **O(p)**, effectively constant.
- The cost is space (each node holds k strings or references) and rebuild time, both paid **offline**.
- Cap prefix length (say 50 characters) and only keep queries above a frequency threshold.

## 5. High-level design

{% diagram "Online path serves from in-memory trie shards; an offline pipeline rebuilds them from query logs" %}
user: Browser /\napp [client] @ 0,1
cdn: CDN / edge\ncache [cdn] @ 1.25,1
svc: Suggest\nservice [lb] @ 2.5,1
trie: Trie shards\n(in memory) [cache] @ 3.75,1
logs: Search\nquery logs [queue] @ 1.25,2.4
agg: Aggregation job\n(Spark, daily) [worker] @ 2.5,2.4
build: Trie builder\n→ snapshots [store] @ 3.75,2.4
user -> cdn : prefix
cdn -> svc : miss
svc -> trie
user --> logs : searches
logs --> agg
agg -> build : query counts
build --> trie : load snapshot
{% enddiagram %}

- **Online**: clients ask for suggestions; edge caches answer popular prefixes; the suggest service routes to the right trie shard and returns its precomputed list.
- **Offline**: search logs (completed searches, not every keystroke) are aggregated into `(query, count)` with time decay, filtered, then built into trie snapshots, written to object storage and loaded into servers with a blue/green swap.

## 6. Deep dives

### Sharding the trie

- **By first character(s)** (`a–c`, `d–f`…) is simple but uneven: far more queries start with "s" than "x".
- Better: split by **observed traffic**, using a shard map built offline from prefix counts so each shard gets equal load. Popular prefixes like "how to" can get a shard of their own.
- **Replicate** each shard several times for read throughput and availability; any replica can answer.

### Reducing load

- **Client debouncing**: send a request after ~100–200 ms without typing, not on every keystroke.
- **Client cache**: typing "how to b" after "how to" can reuse results locally; deleting characters shouldn't refetch.
- **CDN and browser caching** for short, popular prefixes (`max-age` of minutes). They're identical for everyone, so they cache perfectly. That can absorb a large share of traffic.

### Ranking and freshness

- Score = frequency with **time decay** (recent searches weigh more).
- **Trending layer**: daily rebuilds miss breaking news. Add a small real-time component: stream processing over the live search stream detects spiking queries, and the service merges these trending suggestions into results.
- **Personalisation** (extension): merge a small per-user list (their recent searches) with global results on the client or at the edge.

### Safety and quality

Filter suggestions against blocklists (offensive terms, personal data, legal takedowns) **at build time**, plus a fast **runtime blocklist** for urgent removals, so you don't wait for the next rebuild.

### Alternatives

{% procon "Precomputed trie (in memory)", "Search engine prefix queries" %}
- Constant-time lookups; predictable sub-ms latency
- Simple to serve and replicate
- Rebuilt offline; freshness needs a separate trending layer
- Memory-heavy for huge vocabularies
---cons---
- Elasticsearch completion suggesters or edge n-grams
- Easier to update incrementally
- Good for product or document autocomplete with filters
- Higher and less predictable latency at very high QPS
{% endprocon %}

## 7. Bottlenecks and failure modes

| What fails | Impact | Mitigation |
|---|---|---|
| Trie shard replica dies | Less capacity for those prefixes | Multiple replicas; load balancer health checks |
| Bad snapshot (corrupt or offensive) | Wrong suggestions everywhere | Validate before swap; keep the previous snapshot for instant rollback |
| Breaking-news spike | Stale suggestions | Real-time trending layer |
| Hot prefix | One shard overloaded | Split by traffic; edge caching; more replicas |

## 8. Wrap-up

A strong answer: a **trie with top-k precomputed at every node**, an **offline build pipeline** from aggregated logs with **snapshot swaps**, **traffic-aware sharding** with replicas, aggressive **debouncing and caching**, plus a trending layer and blocklists.

**Likely follow-ups:** How would you support typos ("hwo to")? How do you personalise without a cache per user? How would you support many languages (a trie per locale)?
