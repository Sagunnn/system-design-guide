---
title: Consistent hashing
order: 12
summary: Map keys to nodes so that adding or removing a node moves only a small fraction of keys, using a hash ring and virtual nodes.
glance:
  - "With `hash(key) mod N`, changing N remaps **almost every key**, which is a disaster for caches and shards."
  - "Consistent hashing puts nodes and keys on a **ring**; each key belongs to the next node clockwise."
  - "Adding or removing a node moves only about **1/N of the keys**."
  - "**Virtual nodes** (many points per server) even out the load and spread a dead node's keys widely."
---
Suppose you shard a cache across 4 servers with `server = hash(key) mod 4`. Add a fifth server and the formula becomes `mod 5`, and about **80% of keys now map to a different server**. For a cache that means a sudden wave of misses that can take down the database. **Consistent hashing** fixes this.

## The hash ring

Imagine the hash output space (say 0 to 2³²−1) bent into a circle.

1. Hash each **node** (for example its IP) to a point on the ring.
2. Hash each **key** to a point on the ring.
3. A key belongs to the **first node clockwise** from it.

{% diagram "Clockwise ring A → B → C → D: each key belongs to the next node clockwise, so new node D only takes keys that used to belong to A" %}
a: Node A [db] @ 1,0
b: Node B [db] @ 2,1
c: Node C [db] @ 1,2
d: Node D (new) [lb] @ 0,1
k1: key 1 [ext] @ 2,0
k2: key 2 [ext] @ 2,2
k3: key 3 [ext] @ 0,2
a -- b
b -- c
c -- d
d -- a
k1 --> b
k2 --> c
k3 --> d : was A, now D
{% enddiagram %}

When **node D joins**, it takes over only the keys between its predecessor and itself, which used to belong to the next node clockwise. Every other key stays where it was. When a node **leaves**, its keys move to the next node clockwise. On average only **K/N keys move** (K keys, N nodes), instead of almost all of them.

## Virtual nodes

With only a few points on the ring, the arcs between nodes are uneven, so some nodes get far more keys than others. And when a node dies, *all* its load lands on one neighbour.

**Virtual nodes** fix both: each physical server is hashed to many points (say 100–200), named `A#1`, `A#2` and so on.

- Load evens out statistically across servers.
- A dead server's keys spread across *many* other servers, not one.
- Stronger machines can take more virtual nodes, which works as weighting.

## Where it's used

- **Distributed caches**: Memcached client libraries, Redis Cluster (with 16,384 fixed hash slots, a close relative).
- **Partitioned databases**: Cassandra, DynamoDB, Riak place data and replicas on a ring. Replicas go on the next *N* distinct nodes clockwise.
- **Load balancers**: route requests for the same key to the same backend, which keeps caches warm.
- **CDNs and object stores**: decide which server holds which object.

{% procon %}
- Adding or removing nodes moves only ~1/N of keys
- No central lookup table needed; any client can compute the owner
- Virtual nodes give even load and smooth failure handling
---cons---
- Needs virtual nodes to balance well
- Range queries aren't possible (keys are scattered by hash)
- Hot keys still overload their single owner
- Membership changes must reach every client (gossip or config service)
{% endprocon %}

{% callout "interview", "In the interview" %}
Bring it up whenever you shard a cache or a key-value store: "I'll place the cache nodes on a consistent-hash ring with virtual nodes, so adding a node only invalidates about 1/N of the cache instead of all of it."
{% endcallout %}
