---
title: "Databases: SQL vs NoSQL"
navTitle: SQL vs NoSQL
order: 8
summary: The main database families, ACID versus BASE, and how to pick one from the access patterns rather than from fashion.
glance:
  - "**Relational (SQL)**: tables, joins, transactions. The default when data is related and correctness matters."
  - "**NoSQL** families: key-value, document, wide-column, graph. Each is optimised for a specific access pattern."
  - "**ACID** guarantees correct transactions; many NoSQL stores relax this (BASE) for scale and availability."
  - "Choose from **access patterns**: what you query, how often, at what scale and with what consistency."
---
Picking a database is one of the most visible decisions in a design. The honest answer is usually "a relational database, unless an access pattern or scale requirement says otherwise". What the interviewer wants is the *reason*.

## The families

| Type | Data looks like | Strong at | Examples |
|---|---|---|---|
| Relational (SQL) | Tables with rows; related by keys | Joins, transactions, ad-hoc queries | PostgreSQL, MySQL |
| Key-value | `key → value` blobs | Very fast lookups by key, simple scaling | Redis, DynamoDB |
| Document | JSON-like documents | Self-contained records with flexible fields | MongoDB, Firestore |
| Wide-column | Rows with many sparse columns, partitioned | Massive write throughput, time series | Cassandra, HBase, Bigtable |
| Graph | Nodes and edges | Relationship traversal (friends of friends) | Neo4j, Neptune |
| Search | Inverted index | Full-text search, filtering, ranking | Elasticsearch, OpenSearch |
| Time series | Timestamped points | Metrics, rollups, retention | InfluxDB, TimescaleDB |

{% diagram "Polyglot persistence: one system, several stores, each for its access pattern" %}
app: Application @ 0,1
pg: PostgreSQL\nusers, orders [db] @ 2,0
redis: Redis\nsessions, counters [cache] @ 2,1
cass: Cassandra\nevent log [db] @ 3,1.5
es: Elasticsearch\nproduct search [db] @ 2,2.4
app -> pg
app -> redis
app -> cass
app -> es
pg --> es : sync
{% enddiagram %}

## ACID vs BASE

**ACID** is the transaction guarantee of relational databases:

- **Atomicity**: all of a transaction happens, or none of it does.
- **Consistency**: constraints (like "balance ≥ 0") always hold.
- **Isolation**: concurrent transactions don't see each other's half-done work.
- **Durability**: once committed, data survives crashes.

**BASE** (*basically available, soft state, eventually consistent*) describes many distributed NoSQL stores. They stay available and fast across machines and regions, and replicas converge over time. See [CAP and consistency](/topics/cap-theorem/).

## SQL vs NoSQL

{% procon "Relational (SQL)", "NoSQL" %}
- Strong consistency and multi-row transactions
- Joins and flexible queries you didn't plan for
- Mature tooling, well understood
- Scales vertically well; read replicas for reads
- Sharding is possible but manual and painful
---cons---
- Designed to scale horizontally from day one
- Flexible schema, good for evolving or varied data
- Very fast for the access patterns it was modelled for
- Limited joins and transactions (varies by product)
- Query patterns must be known up front; data is often duplicated
{% endprocon %}

## How to choose

1. **Is the data relational, and does correctness matter?** Payments, inventory, bookings → **SQL**.
2. **Is it simple lookups by key at huge scale?** Sessions, carts, feature flags → **key-value**.
3. **Is it write-heavy and append-mostly?** Logs, messages, metrics → **wide-column or time series**.
4. **Is the core query a relationship walk?** Social graphs, recommendations → **graph**.
5. **Do users search text?** Add a **search index** next to your main database.

### Normalisation vs denormalisation

- **Normalised**: store each fact once and join at read time. Writes are simple and consistent; reads need joins.
- **Denormalised**: copy data where it's read, like keeping the author's name on each post. Reads are fast; writes must update every copy. NoSQL designs denormalise heavily, around the queries.

{% callout "think", "Thinking out loud" %}
"Orders and payments need transactions, so they go in Postgres. The activity feed is append-only, huge and read by user ID, which fits Cassandra partitioned by `user_id` and sorted by time. Two stores, each matched to its access pattern."
{% endcallout %}

{% callout "interview", "In the interview" %}
Don't say "NoSQL because it scales". Say which **query** you need to be fast, and which store makes that query cheap. Pair it with the [data model](/topics/how-to-approach/) you've written down.
{% endcallout %}
