---
title: Design a news feed (like Twitter / X)
navTitle: News feed
order: 4
difficulty: Hard
summary: Users post, follow others and read a home timeline. The classic fan-out problem, including the celebrity case that breaks the simple solution.
cards: news-feed
glance:
  - "Massively **read-heavy**: optimise timeline reads, accept eventual consistency."
  - "**Fan-out on write** (push into followers' timelines) gives fast reads but expensive writes for big accounts."
  - "**Fan-out on read** (pull at read time) is cheap to write but slow to read."
  - "The real answer is **hybrid**: push for normal users, pull for celebrities, merge at read time."
---
## 1. Clarify requirements

{% callout "think", "Thinking out loud" %}
"The interesting part is the home timeline: posts from everyone I follow, newest first. I'll confirm whether it's chronological or ranked, how fresh it must be, and the follower distribution, because a few accounts with 100 million followers change everything."
{% endcallout %}

**Functional**

- Post a tweet (text; media via [object storage](/topics/object-storage/) + [CDN](/topics/cdn/)).
- Follow and unfollow users.
- **Home timeline**: recent tweets from followed users, newest first (ranking is an extension).
- **User timeline**: one user's own tweets.

**Non-functional**

- **Fast timeline loads** (p99 < 200 ms).
- **Eventual consistency** is fine: a new tweet can take a few seconds to appear for followers.
- Highly available. Read-heavy.
- Scale: **200M DAU**; each loads the timeline ~10× a day and posts ~0.5 tweets a day; average **200 followers**, but some accounts have **100M+**.

## 2. Estimates

- Timeline reads: 200M × 10 = 2B/day → **~20k/s** average, **~50k/s** peak.
- Tweets: 200M × 0.5 = 100M/day → **~1.2k/s**.
- Fan-out on write: 1.2k tweets/s × 200 followers ≈ **240k timeline inserts/s** on average. Manageable with a queue and workers.
- **Celebrity problem**: one tweet by an account with 100M followers = **100M inserts** for a single post. That's the design challenge.
- Timeline cache: keep the latest ~800 tweet IDs per active user: 8 bytes × 800 ≈ 6.4 KB × 200M ≈ **1.3 TB** of Redis, spread across a cluster. Feasible, especially if we only cache active users.

## 3. API

```
POST /v1/tweets           { text, media_ids[] }           → { tweet_id }
GET  /v1/timeline/home?cursor=…&limit=20                  → { tweets[], next_cursor }
GET  /v1/users/{id}/tweets?cursor=…
POST /v1/users/{id}/follow    DELETE /v1/users/{id}/follow
```

Cursor-based pagination is stable for an infinitely growing feed (see [APIs](/topics/apis/)).

## 4. Data model

| Data | Store | Notes |
|---|---|---|
| Tweets `(tweet_id, author_id, text, media, created_at)` | Sharded store (by `tweet_id` or `author_id`) + tweet cache | Snowflake IDs are time-sortable ([unique IDs](/topics/unique-ids/)) |
| Follows `(follower_id, followee_id)` | Graph or wide-column, indexed both ways | "Who follows X?" and "Who does X follow?" |
| **Home timeline** | **Redis list per user** of tweet IDs, capped at ~800 | Precomputed, IDs only |
| User timeline | Query tweets by `author_id`, time-ordered | Also cacheable |

## 5. High-level design

{% diagram "Post path fans out into cached timelines; read path fetches IDs and hydrates them" %}
user: Client [client] @ 0,1
post: Post service @ 1,0
tl: Timeline\nservice @ 1,2
tw: Tweet store\n+ cache [db] @ 2.3,0
q: Fan-out\nqueue [queue] @ 2.3,1.15
fan: Fan-out\nworkers [worker] @ 3.5,1.15
graph: Follower\ngraph [db] @ 3.5,0
cache: Timeline cache\n(Redis lists) [cache] @ 3.5,2.2
user -> post : POST tweet
user -> tl : GET timeline
post -> tw : save
post -> q : tweet created
q --> fan
fan -> graph : followers?
fan -> cache : push ID
tl -> cache : IDs
tl -> tw : hydrate
{% enddiagram %}

## 6. Deep dives

### Fan-out on write vs on read

{% procon "Fan-out on write (push)", "Fan-out on read (pull)" %}
- On post, insert the tweet ID into every follower's timeline cache
- Reads are trivial: fetch a ready-made list. **Very fast**
- Write cost = number of followers: **terrible for celebrities**
- Wasted work for inactive followers who never look
---cons---
- On read, fetch recent tweets from everyone you follow and merge
- Writes are trivial: just store the tweet
- Read cost = number of followees: **slow** for people following thousands
- Repeated work on every timeline load
{% endprocon %}

### The hybrid answer

{% diagram "Hybrid: precomputed timeline for normal accounts, merged at read time with celebrities' recent tweets" %}
tl: Timeline service @ 0,1
pre: Precomputed IDs\n(fan-out on write) [cache] @ 1,0
celeb: Celebrities\nyou follow [db] @ 1,2
merge: Merge + sort\nby time @ 2,1
out: Your timeline [client] @ 3,1
tl -> pre : read list
tl -> celeb : recent tweets
pre -> merge
celeb -> merge
merge -> out
{% enddiagram %}

- Accounts **below a follower threshold** (say 100k) use **fan-out on write**.
- **Celebrities** are *not* fanned out. At read time, the timeline service fetches recent tweets from the (few) celebrities you follow and **merges** them with your precomputed list.
- Reads stay fast (one cached list plus a handful of cached celebrity timelines) and no single post triggers 100M writes.

{% callout "think", "Thinking out loud" %}
"Pure push breaks on celebrities, and pure pull breaks on users who follow thousands. A hybrid caps both costs: the expensive case on each side is handled by the other strategy. I'd also skip fan-out to users inactive for 30 days and rebuild their timeline on demand when they return."
{% endcallout %}

### Timeline storage and hydration

- Store **only tweet IDs** in each timeline list (`LPUSH`, then `LTRIM` to 800). Small and cheap.
- At read time, fetch IDs from the cursor position, then **hydrate** them in one batch from the tweet cache (a multi-get), with author info from a user cache.
- Deleted tweets: hydration skips missing IDs, so no need to touch millions of lists.
- Cache miss (a user returning after months): rebuild by pulling from their followees, which is the fan-out-on-read path.

### Ranking (extension)

For a ranked feed, generate candidates as above, then score them by engagement, relationship strength and recency with a lightweight model, and cache the ranked page. Mention it, but keep the core design chronological unless asked.

### Scaling the parts

- **Tweet store**: sharded by `tweet_id`; the user timeline needs an index by `(author_id, created_at)`. Hot tweets live in the tweet cache.
- **Follower graph**: sharded by user ID; celebrity follower lists are huge, so stream them in pages to the fan-out workers.
- **Fan-out workers**: horizontally scaled consumers of a partitioned [queue](/topics/message-queues/); idempotent pushes (re-pushing an ID already present is harmless if we dedupe on read).
- **Media**: uploads go to object storage via pre-signed URLs and are served through a CDN, which is most of the bandwidth.

## 7. Bottlenecks and failure modes

| What fails | Impact | Mitigation |
|---|---|---|
| Fan-out backlog | Tweets appear late | Autoscale workers; prioritise active followers; it's eventual anyway |
| Timeline cache shard lost | Some users see empty feeds | Replicas; rebuild on miss via fan-out on read |
| Viral tweet | Hot key in the tweet cache | Replicate hot keys; small in-process cache |
| Celebrity posts burst | Read-side merge hot spot | Cache celebrities' recent-tweets lists aggressively |
| Graph store slow | Fan-out stalls | Queue absorbs it; backpressure and retries |

## 8. Wrap-up

A strong answer: do the read and write estimates; compare **push vs pull** clearly; solve the **celebrity problem with a hybrid**; store IDs and hydrate; use cursor pagination; explain why eventual consistency is acceptable.

**Likely follow-ups:** How would you implement a ranked "For you" feed? How do you handle unfollows (filter at read time, cleaned up lazily)? How would you add search or trending topics (stream processing over the tweet firehose)?
