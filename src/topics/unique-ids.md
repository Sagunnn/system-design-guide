---
title: Generating unique IDs
navTitle: Unique IDs
order: 18
summary: Create IDs across many machines without collisions, from UUIDs to Twitter's Snowflake, and what each option means for ordering, size and coordination.
glance:
  - "Database auto-increment breaks once you have many writers or shards."
  - "**UUID v4**: random 128-bit, no coordination, but unordered (bad for B-tree inserts)."
  - "**Snowflake**: 64-bit = **timestamp + machine ID + sequence**. Roughly time-sortable, no coordination."
  - "**UUID v7 / ULID**: time-ordered 128-bit IDs. A modern, simple middle ground."
---
On one database, `AUTO_INCREMENT` gives neat IDs. With many shards or regions it fails: two shards both issue `id = 1001`. You need IDs that are **unique without a central bottleneck**, and often **roughly sortable by time**, so recent items sort together and B-tree inserts stay efficient.

## The options

### Auto-increment per shard, with offsets

Shard 1 issues 1, 3, 5…; shard 2 issues 2, 4, 6…

- Simple, small, numeric.
- Adding shards is painful, and IDs reveal volume.

### UUID v4 (random)

128 random bits, like `9b2f5c3e-…`.

- No coordination at all; generate anywhere.
- **Not sortable**, and random inserts fragment B-tree indexes. 128 bits is also large for keys.

### Ticket server

A central database hands out IDs, sometimes in **blocks** (each app server takes 1,000 at a time).

- Simple, numeric, ordered.
- A central dependency, so it needs redundancy. Blocks reduce the load on it.

### Snowflake (Twitter)

A **64-bit** integer built from parts:

| Bits | Field | Meaning |
|---|---|---|
| 1 | Sign | Always 0 |
| 41 | Timestamp | Milliseconds since a custom epoch: ~69 years |
| 10 | Machine ID | Up to 1,024 generators (often split datacenter + worker) |
| 12 | Sequence | Up to 4,096 IDs per millisecond per machine |

{% diagram "Each generator builds IDs locally from time, its own machine ID and a counter" %}
svc: Services @ 0,1
g1: ID generator\nmachine 7 [worker] @ 1,0
g2: ID generator\nmachine 8 [worker] @ 1,2
zk: Config service\n(assigns IDs) [ext] @ 2,1
svc -> g1
svc -> g2
zk --> g1 : machine ID
zk --> g2 : machine ID
{% enddiagram %}

- Fits in a 64-bit integer; **roughly time-ordered**; millions per second with no coordination per ID.
- Each generator needs a **unique machine ID**, assigned by config or a coordination service.
- **Clock problems**: if a machine's clock jumps backwards, it could repeat IDs, so generators must detect this and wait. IDs are only *roughly* ordered across machines, because clocks differ slightly.

### UUID v7 and ULID

Modern 128-bit IDs that start with a millisecond timestamp, followed by randomness.

- Time-sortable like Snowflake, with no machine IDs to manage.
- Bigger than 64 bits, but now widely supported (UUID v7 is standardised).

## Choosing

| Need | Choose |
|---|---|
| Simplest, no ordering needed | UUID v4 |
| Sortable, simple, 128-bit OK | UUID v7 / ULID |
| Compact 64-bit, sortable, huge scale | Snowflake |
| Short, human-facing codes (URLs) | Base62 encoding of a counter or hash (see the [URL shortener](/practice/url-shortener/)) |

{% procon "Snowflake", "UUID v4" %}
- 64-bit: compact keys and indexes
- Roughly time-sorted: efficient inserts, easy "newest first"
- Needs machine-ID assignment and sane clocks
---cons---
- Zero coordination, trivially simple
- 128-bit and random: bigger, unordered keys
- No information leaked about time or volume
{% endprocon %}

{% callout "interview", "In the interview" %}
When you shard, mention IDs: "Auto-increment won't work across shards, so I'll use Snowflake-style IDs: time-sortable, 64-bit, and generated locally on each service."
{% endcallout %}
