---
title: Content delivery networks (CDNs)
navTitle: CDNs
order: 7
summary: Serve static and cacheable content from servers near your users, using pull or push models, cache headers and versioned URLs.
glance:
  - "A CDN is a global network of **edge servers** that cache your content near users."
  - "**Pull CDN**: the edge fetches from your origin on the first miss. **Push CDN**: you upload content ahead of time."
  - "Control freshness with `Cache-Control` headers; avoid purges with **versioned file names** (`app.3f9a.js`)."
  - "CDNs also absorb traffic spikes and DDoS attacks, and terminate TLS close to users."
---
Light in fibre is fast, but a round trip between continents still takes ~150 ms, and a page needs many round trips. A **content delivery network** fixes that by keeping copies of your content in **points of presence (PoPs)** around the world, so most requests are answered a few milliseconds from the user.

{% diagram "Users hit nearby edges; only misses travel to the origin" %}
u1: Users in Asia [client] @ 0,0
u2: Users in Europe [client] @ 0,2
e1: Edge PoP\nSingapore [cdn] @ 1,0
e2: Edge PoP\nFrankfurt [cdn] @ 1,2
shield: Origin shield [cdn] @ 2,1
origin: Origin\n(app or S3) [store] @ 3,1
u1 -> e1
u2 -> e2
e1 --> shield : miss
e2 --> shield : miss
shield -> origin
{% enddiagram %}

An **origin shield** is an extra cache layer between the edges and your origin, so a cache miss in 50 PoPs becomes one request to the origin rather than 50.

## Pull vs push

{% procon "Pull CDN", "Push CDN" %}
- Edge fetches from the origin on the first request, then caches it
- Zero upload work; new files just appear
- First user in each region pays the miss
- Best for most websites and APIs
---cons---
- You upload files to the CDN ahead of time
- No first-request miss; you control exactly what's there
- You manage uploads, storage and expiry
- Best for large, rarely changing files (video libraries, game patches)
{% endprocon %}

## Controlling freshness

- `Cache-Control: public, max-age=31536000, immutable`: cache for a year, for files whose name changes when their content does.
- `Cache-Control: max-age=60`: cache briefly, for things that change.
- `Cache-Control: no-store`: never cache private or per-user responses.
- `ETag` and `Last-Modified` let caches **revalidate** cheaply (`304 Not Modified`) instead of downloading again.

{% callout "tip", "Versioned URLs beat purges" %}
Put a content hash in the file name (`styles.8c1f2.css`) and cache it forever. A new deploy produces a new name, so there's nothing to purge and no stale CSS.
{% endcallout %}

## What else a CDN gives you

- **Lower origin load and cost**: most bandwidth is served from the edge.
- **Spike and DDoS absorption**: huge distributed capacity in front of your servers.
- **TLS termination near users**: faster handshakes.
- **Edge compute**: small functions at the PoP for redirects, A/B tests or auth checks.
- **Dynamic acceleration**: even uncached API calls benefit from the CDN's optimised network paths back to the origin.

{% procon %}
- Big latency win for static and media content
- Offloads bandwidth and requests from your servers
- Built-in resilience against spikes and attacks
---cons---
- Cost per GB at very large scale
- Stale content if cache headers are wrong
- Purges take time to propagate
- Personalised content can't be cached as-is
{% endprocon %}

{% callout "interview", "In the interview" %}
Whenever there are images, video or static assets, put a CDN in the diagram and say what it serves. For media-heavy systems (YouTube, Instagram) it carries most of the traffic. That's often the key insight from your [bandwidth estimate](/topics/estimation/).
{% endcallout %}
