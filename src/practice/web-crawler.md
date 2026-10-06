---
title: Design a web crawler
navTitle: Web crawler
order: 7
difficulty: Medium
summary: Download a billion pages a month politely and without repeats. Tests queue design (the URL frontier), deduplication with Bloom filters and partitioned, fault-tolerant workers.
cards: web-crawler
glance:
  - "The **URL frontier** is the core: **priority** queues for importance, **per-host** queues for politeness."
  - "**Politeness**: obey `robots.txt` and limit requests per host; partition hosts across workers."
  - "Dedupe **URLs** (normalise + Bloom filter) and **content** (checksums, SimHash for near-duplicates)."
  - "Avoid **crawler traps** with depth limits, URL length limits and per-site page caps."
---
## 1. Clarify requirements

{% callout "think", "Thinking out loud" %}
"A crawler sounds simple (fetch, parse, follow links) until you add scale and manners. I'll ask what it's for (a search index? archiving?), how many pages, how fresh, and which content types, then design around politeness and dedupe."
{% endcallout %}

**Functional**

- Start from seed URLs, download pages, extract links, follow them.
- Store page content for a downstream **search indexer**.
- **Re-crawl** pages periodically to keep them fresh.
- HTML only for now (images and PDFs are extensions).

**Non-functional**

- **Scale**: **1 billion pages per month**.
- **Politeness**: never overload a website; obey `robots.txt`.
- **Robustness**: survive bad HTML, slow servers, traps, crashes.
- **Extensible**: easy to add content types or processing steps.

## 2. Estimates

- 1B pages / month ≈ 33M / day → 33 × 10⁶ ÷ 10⁵ ≈ **400 pages/s** (peak ~800).
- Average page ~500 KB → **200 MB/s** of download bandwidth (~1.6 Gbps).
- Storage: 1B × 500 KB = **500 TB/month** raw; compression (~5×) makes it ~100 TB/month. Use object storage.
- URL set: many billions of seen URLs → a **Bloom filter** (~1 byte per URL at a 1% false-positive rate → **~10 GB** for 10B URLs) instead of a giant hash set.

## 3. Components

{% diagram "Crawler pipeline: frontier → fetch → parse → dedupe → back into the frontier" %}
seed: Seed URLs [client] @ 0,0
front: URL frontier\n(priority + per-host) [queue] @ 1.1,0
fetch: Fetchers [worker] @ 2.4,0
dns: DNS cache [cache] @ 3.6,0
robots: robots.txt\ncache [cache] @ 3.6,1.2
parse: Parser +\nlink extractor [worker] @ 2.4,1.2
store: Content store\n(object storage) [store] @ 2.4,2.4
seen: URL dedupe\n(Bloom filter) [cache] @ 1.1,1.2
seed -> front
front -> fetch : next URL
fetch -> dns
fetch -> robots : allowed?
fetch -> parse : page
parse -> store : content
parse -> seen : new links
seen -> front : unseen only
{% enddiagram %}

## 4. Deep dives

### The URL frontier

The frontier decides **what to crawl next**. It has to balance importance and politeness. A classic design (from the Mercator crawler) has two layers:

- **Front queues: priority.** A prioritiser scores each URL (PageRank-ish importance, how often the page changes, domain quality) and puts it in one of several priority queues. Selection is biased toward high priority.
- **Back queues: politeness.** Each back queue holds URLs for **one host**. A heap tracks when each host may next be contacted (for example one request per second, or the `Crawl-delay` from `robots.txt`). A fetcher thread takes the host whose time has come.

The frontier is too big for memory, so keep it in a **durable, partitioned store** (Kafka topics or a disk-backed queue) with in-memory buffers at the head. That also means a crash loses no state.

### Politeness and robots.txt

- Fetch and cache each host's **`robots.txt`** (refresh daily); skip disallowed paths.
- At most **one connection per host** at a time, with a delay between requests.
- **Partition hosts across crawler workers** by `hash(host)`, so politeness for a host is enforced in one place without coordination.
- Identify yourself with a clear User-Agent and contact URL.

### Fetching efficiently

- Many concurrent connections per worker (async I/O), since most time is spent waiting on the network.
- A **DNS cache**: resolvers are slow and rate-limited, and a crawler resolves the same hosts constantly.
- Timeouts, maximum page size, and handling redirects without loops.

### Deduplication

**URLs**: normalise first (lowercase the host, strip fragments and default ports, sort query parameters, drop tracking parameters), then check a **Bloom filter** of seen URLs.

{% procon "Bloom filter", "Exact hash set" %}
- Tiny memory (~10 GB for 10B URLs)
- Very fast membership checks
- **False positives**: a few new URLs are wrongly skipped (acceptable for a crawler)
- No false negatives: never crawls a seen URL twice
---cons---
- Exact answers
- Hundreds of GB of memory, or a disk-backed store with slower lookups
- Easier to delete entries and inspect
- Fine at small scale
{% endprocon %}

**Content**: different URLs often serve the same page (mirrors, session IDs). Store a **checksum** of each page's content to skip exact duplicates, and **SimHash** fingerprints to catch near-duplicates (same article, different ads).

### Crawler traps

Infinite URL spaces (calendars with endless "next month" links, session IDs in URLs, generated pages). Defences: a maximum URL length, a maximum crawl depth, a per-host page budget, and detecting repeating path patterns.

### Freshness: re-crawling

Pages change at very different rates (news front pages hourly, an old blog post never). Track each page's observed change frequency and schedule re-crawls accordingly. Use conditional requests (`If-Modified-Since`, ETags) so unchanged pages cost a cheap `304`.

### Scaling out

Run hundreds of crawler nodes, each owning a partition of hosts (consistent hashing on host, so nodes can be added). Extracted links for hosts owned by another node are sent to that node's frontier partition.

## 5. Bottlenecks and failure modes

| What fails | Impact | Mitigation |
|---|---|---|
| Crawler node crash | Its hosts pause | Durable frontier partitions; reassign the partition; resume from checkpoint |
| Slow or hostile sites | Threads tied up | Strict timeouts and size limits; per-host concurrency of one |
| Spider trap | Infinite crawl on one site | Depth, URL-length and per-host page caps |
| DNS overload | Fetches stall | Local DNS cache, multiple resolvers |
| Hot host (huge site) | One partition overloaded | Per-host rate limits mean it's crawled slowly, not faster; split very large sites by path |

## 6. Wrap-up

A strong answer: a two-layer **frontier** (priority + per-host politeness queues), `robots.txt` and host partitioning, **URL normalisation + Bloom filter** and content fingerprints for dedupe, trap defences, and a durable, partitioned frontier for fault tolerance.

**Likely follow-ups:** How would you render JavaScript-heavy pages (a headless browser pool, which is expensive, so used selectively)? How do you prioritise a new site you've never seen? How would you crawl images or PDFs (extensible content handlers)?
