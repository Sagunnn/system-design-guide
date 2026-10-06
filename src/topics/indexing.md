---
title: Indexes and storage engines
navTitle: Indexes & storage engines
order: 9
summary: How databases find rows fast (B-trees and LSM-trees), the trade-off between read and write speed, and how to design indexes for your queries.
glance:
  - "An **index** is a sorted copy of some columns that points back to rows, turning a full scan into a lookup."
  - "**B-tree** (most SQL databases): balanced tree, fast reads and range scans, in-place updates."
  - "**LSM-tree** (Cassandra, RocksDB): writes go to memory and append-only files, then compact. Very fast writes."
  - "Every index speeds up reads but slows down writes and costs storage."
---
Without an index, finding `WHERE email = 'a@b.com'` means reading every row: a **full table scan**, O(n). An **index** keeps a sorted structure on that column, so the lookup becomes O(log n). Indexes are the single biggest performance lever in most databases.

## B-trees

The standard index in PostgreSQL, MySQL and most relational databases.

- A **balanced tree** of fixed-size pages (often 4–16 KB). Each page holds sorted keys and pointers to child pages.
- A lookup walks from the root to a leaf: ~3–4 page reads even for billions of rows, because each page has hundreds of children.
- Leaves are sorted and linked, so **range queries** (`created_at BETWEEN …`) are fast.
- Updates modify pages **in place**, with a write-ahead log for crash safety.

## LSM-trees (log-structured merge-trees)

Used by Cassandra, RocksDB, LevelDB, HBase and ScyllaDB, which are built for write-heavy workloads.

{% diagram "An LSM-tree: fast in-memory writes, flushed to immutable sorted files, compacted in the background" %}
w: Write [client] @ 0,1
wal: Write-ahead\nlog [store] @ 1,0
mem: Memtable\n(in memory) [cache] @ 1,1.6
l0: SSTables\nlevel 0 [db] @ 2,1.6
l1: SSTables\nlevel 1 (merged) [db] @ 3,1.6
w -> wal : 1. append
w -> mem : 2. insert
mem -> l0 : 3. flush
l0 -> l1 : 4. compact
{% enddiagram %}

1. Each write is appended to a **write-ahead log** (for durability) and inserted into an in-memory sorted table (the **memtable**).
2. When the memtable fills, it's flushed to disk as an immutable sorted file, an **SSTable**.
3. Background **compaction** merges SSTables, dropping overwritten and deleted values.
4. Reads check the memtable, then SSTables from newest to oldest. **Bloom filters** skip files that can't contain the key.

## B-tree vs LSM-tree

{% procon "B-tree", "LSM-tree" %}
- Fast, predictable reads and range scans
- Each key lives in one place: simple transactions and locking
- Random writes are slower (in-place page updates)
- The default for read-heavy, transactional workloads
---cons---
- Very high write throughput (sequential appends)
- Good compression; small storage footprint
- Reads may check several files (Bloom filters help)
- Compaction uses background I/O and can cause latency spikes
{% endprocon %}

## Designing indexes

- **Index the columns you filter, join and sort by.** Write the queries first.
- **Composite indexes** follow the *leftmost prefix* rule: an index on `(user_id, created_at)` serves `WHERE user_id = ? ORDER BY created_at`, but not `WHERE created_at = ?` alone.
- **Covering indexes** include every column a query needs, so the database never touches the table.
- **Selectivity matters.** An index on a boolean column rarely helps.
- **Every index costs writes.** Each `INSERT` updates every index on the table, so don't index "just in case".
- **Secondary indexes in sharded systems** are expensive: either every shard keeps a local index (and queries fan out), or there's a global index (and writes cross shards).

{% callout "interview", "In the interview" %}
When you write the data model, say which index serves which query: "Primary key `short_code` for redirects; a secondary index on `(user_id, created_at)` for listing a user's links." If the workload is write-heavy, like chat messages or metrics, mention that an LSM-based store suits it.
{% endcallout %}
