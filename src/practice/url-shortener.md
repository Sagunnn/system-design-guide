---
title: Design a URL shortener (like bit.ly)
navTitle: URL shortener
order: 1
difficulty: Easy
summary: Turn long URLs into short codes and redirect at high read volume. A classic warm-up that tests ID generation, caching and read-heavy design.
cards: url-shortener
glance:
  - "Read-heavy (≈100:1), so **cache + replicas** matter more than write scaling."
  - "The core decision is **how to generate short codes**: hash, counter + base62, or a key-generation service."
  - "7 base62 characters give **3.5 trillion** codes, plenty for billions of URLs."
  - "**302** keeps analytics accurate; **301** lets browsers cache and cuts load."
---
## 1. Clarify requirements

{% callout "think", "Thinking out loud" %}
"Shortening and redirecting are clearly in scope. I'll ask about custom aliases, expiry and analytics, because each one changes the data model, and about scale, because that decides whether one database is enough."
{% endcallout %}

**Functional**

- Given a long URL, return a unique short URL (`sho.rt/aZ3kQ9p`).
- Visiting the short URL **redirects** to the long one.
- Optional: custom aliases, expiry dates, click analytics.

**Non-functional**

- **Very high availability** on redirects: a broken short link breaks someone else's page.
- **Low latency** redirects (tens of milliseconds).
- Short codes must be **unique** and ideally **not guessable** in sequence.
- Scale (agreed with the interviewer): **100 million new URLs per month**, read:write ratio **100:1**, keep links **5 years**.

## 2. Estimates

- Writes: 100M / month ≈ 3.3M / day → 3.3 × 10⁶ ÷ 10⁵ ≈ **40 writes/s** (peak ~100).
- Reads: 100 × writes ≈ **4,000 redirects/s** average, ~**10k/s** peak.
- Storage: 100M × 12 months × 5 years = **6 billion URLs** × ~500 bytes ≈ **3 TB**.
- Code length: base62 (a–z, A–Z, 0–9) has 62⁶ ≈ 57 billion and 62⁷ ≈ **3.5 trillion** combinations. 7 characters gives lots of headroom.
- Cache: 20% of daily reads cover most traffic. 4,000 × 10⁵ × 0.2 × 500 B ≈ **40 GB**, which fits in a small Redis cluster.

{% callout "think", "Thinking out loud" %}
"Forty writes a second is tiny, so writes aren't the challenge. Ten thousand redirects a second with low latency is: that's a caching problem. And 3 TB over five years is comfortable for a key-value store or a sharded SQL setup."
{% endcallout %}

## 3. API

```
POST /api/v1/urls
  { "long_url": "https://…", "custom_alias": "my-talk", "expires_at": "2027-01-01" }
  → 201 { "short_url": "https://sho.rt/aZ3kQ9p" }

GET /{code}
  → 302 Found, Location: https://…     (or 404 / 410 Gone if expired)
```

Add an API key for creators and [rate limiting](/topics/rate-limiting/) on `POST`, to stop spam.

## 4. Data model

| Table `urls` | |
|---|---|
| `code` (PK) | `aZ3kQ9p` |
| `long_url` | the target |
| `user_id` | creator (nullable) |
| `created_at`, `expires_at` | timestamps |

The hot query is a single lookup by `code`. That suits a **key-value store** (DynamoDB, Cassandra) or SQL with `code` as the primary key. Both work; I'd pick a key-value store for effortless horizontal scaling and lookups by key.

## 5. High-level design

{% diagram "URL shortener: a write path that creates codes, and a cached read path that redirects" %}
user: Browser [client] @ 0,1
lb: Load balancer [lb] @ 1,1
w: Shorten\nservice @ 2,0
r: Redirect\nservice @ 2,2
kgs: Key / ID\ngenerator [worker] @ 3.3,0
cache: Cache\n(Redis) [cache] @ 3.3,2
db: URL store\n(KV, replicated) [db] @ 4.4,1
q: Click events [queue] @ 3.3,3.1
user -> lb
lb -> w : POST
lb -> r : GET /code
w -> kgs : next code
w -> db : save
r -> cache : 1. lookup
r -> db : 2. on miss
r --> q : click
{% enddiagram %}

- **Write path**: the shorten service gets a unique code, stores `code → long_url`, and returns the short URL.
- **Read path**: the redirect service checks Redis; on a miss it reads the store and fills the cache; then it responds with a redirect.
- Click events go onto a [queue](/topics/message-queues/) for analytics, so the redirect never waits for them.

## 6. Deep dives

### Generating short codes

This is the heart of the question. Three options:

**a) Hash the long URL** (MD5 or SHA-256, base62-encode, take 7 characters)

{% procon %}
- The same long URL always gives the same code (natural dedupe)
- No coordination between servers
---cons---
- **Collisions** after truncation: check the store and re-hash with a salt
- The extra check costs a read on every write
- Custom aliases still need separate handling
{% endprocon %}

**b) Unique counter + base62**: encode an ever-increasing integer (`125 → "21"`)

{% procon %}
- Guaranteed unique; no collision checks
- Short codes, simple maths
---cons---
- A single counter is a bottleneck and a single point of failure, so hand out **ranges**: each server reserves 1,000 numbers at a time (from ZooKeeper, a DB row, or Snowflake-style [IDs](/topics/unique-ids/))
- Sequential codes are **guessable**: someone can enumerate everyone's links. Fix by permuting (a bijective shuffle) before encoding
{% endprocon %}

**c) Key-generation service (KGS)**: pre-generate random 7-character codes offline and store them in an "unused" table; servers take batches

{% procon %}
- Codes are random (not guessable) and guaranteed unique
- Writes are just "take a key", which is very fast
---cons---
- Another service and datastore to run
- Must never hand the same key out twice: mark keys used atomically, and lose a server's unused batch if it crashes (acceptable)
{% endprocon %}

{% callout "think", "My choice" %}
"I'd use counter ranges with a bijective shuffle and base62. Each server leases a block of IDs, so there's no per-request coordination, no collision checks and no guessable sequence. A KGS is equally good if the interviewer prefers random codes. Hashing works but needs collision handling on every write."
{% endcallout %}

### Making redirects fast and available

- **Cache aggressively**: links almost never change, so cache-aside with a long TTL and LRU eviction. Expect a 90%+ hit rate thanks to the 80/20 skew.
- **Replicate** the URL store across zones; reads can come from any replica, because a link is written once and never edited, so stale reads aren't a concern.
- **301 vs 302**: a `301 Moved Permanently` is cached by browsers, so repeat visits skip your servers entirely: cheaper, but you lose click counts and can't change the target. A `302 Found` brings every click to you, which keeps analytics accurate. Choose based on whether analytics is a requirement.
- For global users, serve redirects from **multiple regions** or at the **CDN edge**, backed by replicated data.

### Custom aliases and duplicates

- Custom alias: write with a **conditional insert** ("only if this code doesn't exist") and return `409 Conflict` if taken. Keep aliases in the same keyspace, so they never collide with generated codes (or use a reserved prefix).
- Same long URL twice: either create a new code each time (simple; lets each user track their own clicks) or look it up first by a hash index of `long_url` (saves space).

### Analytics

Redirects publish `{code, timestamp, country, referrer}` to a queue. A stream processor aggregates counts per code per hour into an analytics store. This is eventually consistent, which is fine for dashboards, and redirect latency is unaffected.

### Expiry

Check `expires_at` on read (return `410 Gone`) and delete expired rows with a background job. Expired codes can go back into the KGS pool later, but only after a long grace period.

## 7. Bottlenecks and failure modes

| What fails | Impact | Mitigation |
|---|---|---|
| Cache node | More misses, higher DB load | Cache cluster with replicas; consistent hashing limits reshuffling |
| URL store node | Some reads and writes fail | Replication across zones; automatic failover |
| ID / key service | Can't create new links | Servers hold leased ranges or batches, so they keep working for a while |
| Viral link | Hot key on one cache shard | In-process cache in front of Redis; replicate the hot key |
| Abuse (spam, phishing) | Reputation damage | Rate-limit creation, scan URLs against blocklists |

## 8. Wrap-up

A strong answer covers: read-heavy maths → caching; a clear, justified ID-generation choice with its trade-offs; 301 vs 302; a key-value store keyed by code; and the async analytics path.

**Likely follow-ups:** How would you stop people enumerating codes? How do you handle 10× traffic? What changes for multi-region? How do you delete a malicious link everywhere quickly (cache invalidation plus a CDN purge)?
