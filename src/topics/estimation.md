---
title: Back-of-the-envelope estimation
navTitle: Estimation
order: 2
summary: Turn "100 million users" into requests per second, storage and bandwidth in a minute of arithmetic, and use the numbers to decide what's hard.
glance:
  - "A day has ~86,400 seconds; round to **100,000** (10⁵) for quick maths."
  - "QPS = daily requests ÷ 10⁵. Peak is usually **2–3× the average**."
  - "Storage = items per day × size × retention. Bandwidth = QPS × size."
  - "Memory is ~100× faster than SSD, and a cross-continent round trip is ~150 ms."
---
Estimation isn't about precise numbers. It's about **orders of magnitude**: is this 10 requests per second or 100,000? Is the data 1 GB (fits in memory) or 1 PB (needs many machines)? Those answers decide the architecture.

## The numbers to memorize

### Powers of ten

| Power | Exact | Approx | Name |
|---|---|---|---|
| 2¹⁰ | 1,024 | 10³ | Thousand · KB |
| 2²⁰ | 1,048,576 | 10⁶ | Million · MB |
| 2³⁰ | ~1.07 × 10⁹ | 10⁹ | Billion · GB |
| 2⁴⁰ | ~1.1 × 10¹² | 10¹² | Trillion · TB |
| 2⁵⁰ | ~1.13 × 10¹⁵ | 10¹⁵ | Quadrillion · PB |

### Latency numbers (rough, but the ratios matter)

| Operation | Time |
|---|---|
| L1 cache reference | ~1 ns |
| Main memory reference | ~100 ns |
| Read 1 MB sequentially from memory | ~10 µs |
| SSD random read | ~100 µs |
| Read 1 MB sequentially from SSD | ~1 ms |
| Round trip within a data center | ~0.5 ms |
| Disk (HDD) seek | ~10 ms |
| Round trip across continents | ~150 ms |

The takeaways: **memory beats disk, and the network is slow across distance.** That's why caches live in memory, and why CDNs put content near users.

### Time

- 1 day = 86,400 s ≈ **10⁵ s**
- 1 month ≈ 2.5 × 10⁶ s
- 1 year ≈ 3 × 10⁷ s

## The recipe

{% diagram "From users to the numbers that drive the design" %}
dau: Daily active\nusers [client] @ 0,1
req: Requests\nper day @ 1,1
qps: Average QPS @ 2,0
peak: Peak QPS @ 3,0
store: Storage\nper year [db] @ 2,2
bw: Bandwidth @ 3,2
dau -> req : × actions
req -> qps : ÷ 10⁵
qps -> peak : × 2–3
req -> store : × size × 365
qps -> bw : × size
{% enddiagram %}

1. **Requests per day** = daily active users × actions per user.
2. **QPS** = requests per day ÷ 10⁵ (seconds in a day, rounded).
3. **Peak QPS** = 2–3 × average (more for spiky products).
4. **Storage** = new items per day × item size × retention.
5. **Bandwidth** = QPS × response size.
6. **Cache size** often follows the 80/20 rule: caching the hottest 20% of a day's reads covers most traffic.

## Worked example: a photo-sharing app

Assume **10 million DAU**, each viewing 50 photos and uploading 0.2 photos per day. Photos average **500 KB**.

- Reads: 10⁷ × 50 = 5 × 10⁸/day → 5 × 10⁸ ÷ 10⁵ = **5,000 QPS** average, ~**15,000** peak.
- Writes: 10⁷ × 0.2 = 2 × 10⁶/day → **20 uploads/s**.
- Read/write ratio: **250:1** → read-heavy, so caching and a CDN matter most.
- Storage: 2 × 10⁶ × 500 KB = 10¹² bytes = **1 TB/day** → **~365 TB/year** → object storage, not a database.
- Egress bandwidth: 5,000 × 500 KB = **2.5 GB/s** → serve images from a CDN.

{% callout "think", "Thinking out loud" %}
"Twenty uploads a second is easy, so writes aren't my problem. Two and a half gigabytes a second of image traffic is, and that's a CDN's job. A third of a petabyte a year means object storage like S3, with only metadata in the database."
{% endcallout %}

## Common mistakes

{% procon %}
- Round early and often (86,400 → 10⁵)
- State every assumption so the interviewer can correct it
- Say what each number *means* for the design
- Keep units visible (KB vs MB is a 1,000× error)
---cons---
- Spending ten minutes on exact arithmetic
- Producing numbers and never using them
- Forgetting peak traffic, replication factor (×3) or metadata
- Mixing bits and bytes in bandwidth
{% endprocon %}

{% callout "interview", "In the interview" %}
Do estimates *before* the high-level design, and refer back to them: "We said 15k peak read QPS, so a single Postgres primary won't cut it for reads. That's why I'm adding read replicas and a cache."
{% endcallout %}
