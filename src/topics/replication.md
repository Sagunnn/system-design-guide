---
title: Replication
order: 10
summary: Keep copies of data on several machines for availability, read scaling and durability. Covers leader–follower, multi-leader and leaderless replication, and the lag problems each brings.
glance:
  - "Replication = the same data on several nodes, for **fault tolerance**, **read scaling** and **lower latency**."
  - "**Leader–follower**: one node takes writes, followers copy it. Simple and very common."
  - "**Synchronous** replication = no data loss but slower writes; **asynchronous** = fast but can lose recent writes."
  - "**Leaderless** (Dynamo-style) uses quorums: if **W + R > N**, reads overlap the latest write."
---
**Replication** keeps copies of the same data on multiple machines. If one dies, another has the data. Reads can be spread across copies, and copies can sit near users in other regions.

## Leader–follower (primary–replica)

The most common setup, used by PostgreSQL, MySQL, MongoDB and Redis.

{% diagram "Leader–follower: writes go to the leader; reads can go to followers" %}
app: App servers @ 0,1
leader: Leader\n(primary) [db] @ 2,0
f1: Follower 1 [db] @ 2,1.3
f2: Follower 2 [db] @ 2,2.4
app -> leader : writes
app --> f1 : reads
app --> f2 : reads
leader -> f1 : replicate
leader -> f2
{% enddiagram %}

- All **writes go to the leader**, which streams its change log to followers.
- **Reads** can go to followers. This scales read throughput, but followers may lag behind.
- **Failover**: if the leader dies, a follower is promoted, either automatically through consensus or by an operator.

### Synchronous vs asynchronous

{% procon "Synchronous", "Asynchronous" %}
- Leader waits for followers to confirm before acknowledging
- No acknowledged write is lost if the leader dies
- Writes are slower; one slow follower stalls everything
- Common compromise: **one** synchronous follower, the rest async ("semi-sync")
---cons---
- Leader acknowledges immediately; followers catch up
- Fast writes; followers can be far away
- **Recent writes can be lost** on failover
- Followers can serve stale reads (replication lag)
{% endprocon %}

## Replication lag problems

With asynchronous followers, a user can see strange things. Each has a standard fix:

| Problem | Example | Fix |
|---|---|---|
| **Read-your-writes** | You post a comment, refresh, and it's gone | Read your own recent writes from the leader, or wait until the replica has caught up to your write |
| **Monotonic reads** | A comment appears, then disappears on the next refresh | Pin each user to the same replica |
| **Consistent prefix** | You see a reply before the question | Write causally related data to the same partition |

## Multi-leader

Several nodes accept writes, typically **one leader per region**, and they replicate to each other.

- Low write latency in every region, and each region survives the others going down.
- **Write conflicts**: two regions edit the same record at once. Resolve with *last-write-wins* (simple, loses data), merging, or **CRDTs** (data types that merge automatically).
- Use it for multi-region apps and offline-first apps (each device is a "leader").

## Leaderless (Dynamo-style)

Used by Cassandra, DynamoDB and Riak. Any replica accepts reads and writes.

- With **N** replicas, a write waits for **W** acknowledgements and a read queries **R** replicas.
- If **W + R > N**, every read overlaps at least one replica with the latest write. For example N = 3, W = 2, R = 2.
- Tune the trade-off: W = 1 for fast writes, R = 1 for fast reads, at the cost of consistency.
- Repair stale replicas with **read repair** (fix on read) and **anti-entropy** (background sync using Merkle trees).
- **Hinted handoff**: if a replica is down, another node holds its writes and passes them on later.

{% procon %}
- High availability: survive node and zone failures
- Read scaling with replicas
- Lower latency by placing copies near users
- Durability: data isn't lost with one disk
---cons---
- Replication lag means stale reads
- Failover is tricky (split brain, lost writes)
- Conflicts with multi-leader and leaderless setups
- More storage and network cost (often 3× copies)
{% endprocon %}

{% callout "interview", "In the interview" %}
"Leader–follower with async replicas for reads, plus one synchronous standby for failover" is a strong default. Then show you know the catch: "followers lag, so a user's own profile edits are read from the leader for a few seconds."
{% endcallout %}
