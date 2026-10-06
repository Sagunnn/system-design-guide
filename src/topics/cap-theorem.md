---
title: "CAP theorem, PACELC and consistency models"
navTitle: CAP & consistency
order: 13
summary: What CAP really says, why it's about network partitions, how PACELC adds the everyday latency trade-off, and the consistency models between "strong" and "eventual".
glance:
  - "CAP: when the network **partitions**, a distributed store must choose **Consistency or Availability**."
  - "Partitions aren't optional in real networks, so the real choice is **CP vs AP** during a partition."
  - "**PACELC**: *else*, with no partition, you still trade **Latency vs Consistency**."
  - "Consistency is a spectrum: strong (linearizable) → causal → read-your-writes → eventual."
---
## CAP, stated precisely

In a distributed data store you'd like all three of:

- **Consistency (C)**: every read sees the most recent write. Formally, *linearizability*: the system behaves like one up-to-date copy.
- **Availability (A)**: every request to a working node gets a (non-error) response.
- **Partition tolerance (P)**: the system keeps working when the network drops messages between nodes.

The **CAP theorem** says that *during a network partition* you can't have both C and A. Partitions happen in any real network, so P is not optional, and the meaningful question is: **when a partition happens, do you refuse some requests (CP) or serve possibly stale data (AP)?**

{% diagram "A partition: the two sides can't talk. Answer anyway (AP) or refuse (CP)?" %}
c1: Client A [client] @ 0,0
c2: Client B [client] @ 0,2
n1: Node 1\nx = 2 (new) [db] @ 2,0
n2: Node 2\nx = 1 (old) [db] @ 2,2
c1 -> n1 : write x = 2
c2 -> n2 : read x ?
n1 -- n2 : network partition
{% enddiagram %}

Client B asks node 2 for `x` while node 2 can't hear from node 1:

- A **CP** system makes node 2 return an error or wait, staying correct but unavailable.
- An **AP** system makes node 2 return `x = 1`, staying available but stale. The nodes reconcile when the partition heals.

### CP vs AP in practice

{% procon "CP: choose consistency", "AP: choose availability" %}
- Minority side of a partition stops accepting writes
- Never returns stale or conflicting data
- Use for: payments, inventory, bookings, locks, leader election
- Examples: ZooKeeper, etcd, Spanner, HBase, a single-leader SQL setup
---cons---
- Every side keeps serving; replicas converge later
- May return stale data or create conflicts to resolve
- Use for: social feeds, likes, shopping carts, DNS, product catalogue
- Examples: Cassandra, DynamoDB (default), CouchDB, Riak
{% endprocon %}

Many systems are **tunable**: Cassandra and DynamoDB let you choose per query (quorum reads for consistency, single-replica reads for speed).

## PACELC: the everyday trade-off

Partitions are rare, but replication is constant. **PACELC** extends CAP:

> If there's a **P**artition, choose **A** or **C**; **E**lse, choose **L**atency or **C**onsistency.

Even on a healthy network, waiting for replicas to confirm (consistency) costs latency, and not waiting (low latency) risks stale reads. Examples: DynamoDB and Cassandra are **PA/EL** (available, low latency); Spanner and most SQL setups are **PC/EC** (consistent, paying latency).

## Consistency models, strongest to weakest

| Model | Guarantee | Typical use |
|---|---|---|
| **Strong / linearizable** | Every read sees the latest write; behaves like one copy | Balances, locks, unique usernames |
| **Sequential** | Everyone sees operations in the same order (not necessarily real-time) | Replicated logs |
| **Causal** | Cause comes before effect (a reply never appears before its question) | Comments, chat |
| **Read-your-writes** | You always see your own updates | Profile edits, posts |
| **Monotonic reads** | You never see data go "back in time" | Any feed |
| **Eventual** | Replicas converge if writes stop | Likes, view counts, DNS |

{% callout "think", "Thinking out loud" %}
"Different parts of one product need different guarantees. The payment ledger must be strongly consistent, so it's CP. Like counts can be eventually consistent and a few seconds behind, so they're AP, and cheap. I'll say that explicitly rather than picking one model for everything."
{% endcallout %}

{% callout "warn", "Common mistakes" %}
"We'll pick CA" isn't a real option for a distributed system, because you can't opt out of partitions. And CAP's "consistency" is not the "C" in ACID: ACID's C is about constraints, while CAP's is about replicas agreeing.
{% endcallout %}

{% callout "interview", "In the interview" %}
Tie CAP to a requirement: "If a region is cut off, I'd rather show slightly stale timelines than errors, so the feed store is AP. Checkout uses a CP store, because selling the last item twice is worse than a failed request."
{% endcallout %}
