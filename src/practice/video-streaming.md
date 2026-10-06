---
title: Design a video streaming platform (like YouTube)
navTitle: Video streaming
order: 5
difficulty: Hard
summary: Upload, transcode and stream video to millions of viewers with smooth playback. Tests media pipelines, adaptive bitrate streaming and CDN-heavy design.
cards: video-streaming
glance:
  - "Two very different paths: a **write path** (upload → transcode) and a **read path** (stream from a CDN)."
  - "Uploads go **directly to object storage**; a **queue** drives a parallel **transcoding pipeline**."
  - "Video is cut into **2–6 s segments** at several bitrates; players switch quality as bandwidth changes (**HLS/DASH**)."
  - "The **CDN carries almost all traffic**; the core design work is getting bytes to edges cheaply."
---
## 1. Clarify requirements

{% callout "think", "Thinking out loud" %}
"Video has two separate problems: getting uploads processed, and getting bytes to viewers. I'll treat them as two pipelines. I'll scope out comments, recommendations and live streaming unless the interviewer wants them."
{% endcallout %}

**Functional**

- Users **upload** videos (up to a few GB).
- Users **watch** videos with smooth playback on any device and connection.
- Basic metadata: title, description, thumbnails; **view counts**.
- Out of scope: recommendations, comments, live streaming, monetisation.

**Non-functional**

- **Smooth playback**: fast start, rare buffering.
- **Global** audience, with huge read bandwidth.
- **Durable** storage: never lose an uploaded video.
- Uploads can take minutes to become watchable, which is acceptable.
- Scale: **100M DAU**, ~5 videos × 5 minutes watched per user per day; **500k uploads/day**.

## 2. Estimates

- Watch time: 100M × 25 min ≈ 2.5B minutes/day. At peak, say **5M concurrent viewers** × ~5 Mbps ≈ **25 Tbps** of egress. That's only possible with a large **CDN**.
- Uploads: 500k/day ≈ **6 uploads/s**; × ~300 MB raw ≈ **150 TB/day** of raw video.
- Transcoded output: several resolutions (240p–4K) and codecs, roughly **1–2× the raw size**, so expect **PB-scale storage per year**. That calls for object storage with lifecycle tiers.

{% callout "think", "Thinking out loud" %}
"Six uploads a second is modest, but each one costs real compute to transcode. Twenty-five terabits a second of playback is the dominant problem: it decides that video bytes come almost entirely from CDN edges, never from our servers."
{% endcallout %}

## 3. API

```
POST /v1/videos                    { title, description, size }
   → { video_id, upload: { multipart pre-signed URLs } }
POST /v1/videos/{id}/complete      (all parts uploaded)
GET  /v1/videos/{id}               → { title, status, thumbnails, manifest_url }
GET  {cdn}/videos/{id}/master.m3u8 → adaptive streaming manifest
POST /v1/videos/{id}/views         (batched / sampled)
```

## 4. Data model

| Data | Store |
|---|---|
| `videos(video_id, owner_id, title, description, status, duration, created_at)` | SQL (sharded by `video_id`) + cache |
| `renditions(video_id, resolution, codec, bitrate, manifest_key)` | SQL |
| Raw uploads, segments, thumbnails | **Object storage**, keyed `videos/{id}/{rendition}/{segment}.ts` |
| View counts | Counters aggregated by a stream processor into a KV store |

## 5. High-level design

{% diagram "Upload path (top) and watch path (bottom): the CDN serves the video bytes" %}
up: Creator [client] @ 0,0.5
api: Upload API @ 1.25,0
raw: Raw storage [store] @ 1.25,1
q: Transcode\nqueue [queue] @ 2.45,1
tx: Transcoding\nworkers [worker] @ 3.65,1
seg: Segment storage\n(origin) [store] @ 4.85,1
meta: Metadata DB\n+ cache [db] @ 1.25,2.3
viewer: Viewer [client] @ 2.45,2.3
cdn: CDN edges [cdn] @ 3.65,2.3
up -> api : 1. init upload
up -> raw : 2. upload parts
raw --> q : 3. uploaded
q --> tx
tx -> seg : 4. segments
tx -> meta : 5. status = ready
viewer -> meta : metadata
viewer -> cdn : segments
cdn --> seg : miss
{% enddiagram %}

## 6. Deep dives

### Uploading reliably

- **Multipart, resumable uploads** directly to [object storage](/topics/object-storage/) with pre-signed URLs: parallel parts, retry only failed parts, resume after network drops.
- The metadata row starts as `status = uploading`. Completion triggers an event onto the transcode queue.
- Validate early: file type, size limits, malware scan.

### The transcoding pipeline

Raw video is huge and comes in random formats. Transcoding produces:

- **Multiple resolutions and bitrates** (240p … 1080p, 4K) and codecs (H.264 for compatibility, VP9/AV1 for efficiency).
- **Segments** of 2–6 seconds per rendition, plus **manifests** listing them.
- Thumbnails, preview sprites and audio tracks.

Make it fast and robust:

- **Split the video into chunks** (by keyframes) and transcode them **in parallel** on many workers, then stitch. A 1-hour video finishes in minutes instead of hours.
- Model it as a **DAG**: split → transcode each rendition → package → thumbnails → publish. Each task is retried independently, and workers are idempotent (writing the same output key twice is harmless).
- Prioritise: popular creators or short videos first; spare capacity for re-encoding old videos into better codecs.

### Adaptive bitrate streaming (HLS / DASH)

{% diagram "The player picks a rendition per segment based on measured bandwidth" %}
player: Video player [client] @ 0,1
m: Master manifest [cdn] @ 1,0
r1: 1080p playlist\n(6 Mbps) [cdn] @ 2,0
r2: 480p playlist\n(1.5 Mbps) [cdn] @ 2,1
r3: 240p playlist\n(0.4 Mbps) [cdn] @ 2,2
player -> m : 1. fetch
m --> r1
m --> r2
m --> r3
player -> r2 : 2. segments
{% enddiagram %}

- The **master manifest** lists renditions; each rendition's playlist lists its segments.
- The player measures throughput and buffer level and picks the best rendition **for each segment**, dropping quality instead of stalling when the network dips.
- Short segments make switching responsive; longer segments are more efficient. 2–6 s is the usual balance.
- **Fast start**: begin at a low bitrate, then climb.

### CDN strategy

- Segments are immutable, so they get `Cache-Control: max-age=31536000, immutable` and cache perfectly.
- **Popular videos** are cached at (or pushed to) edges; the **long tail** is served from regional caches or origin shields, then the origin. Viewing follows a power law, so a small set of videos is most of the traffic.
- Some platforms place cache appliances **inside ISPs' networks** (Netflix Open Connect, Google Global Cache) to cut transit costs.

### View counts

Counting every view synchronously in a database would be a hot-key nightmare for viral videos. Instead:

- Clients send view events (batched); events go to a stream ([Kafka](/topics/message-queues/)).
- A stream processor aggregates counts per video per minute and updates a counter store.
- Displayed counts are **eventually consistent** (a few seconds behind). Dedupe and fraud filtering happen in the pipeline.

### Storage cost

PB-scale storage needs **lifecycle tiers**: keep popular renditions hot; move rarely watched videos' renditions to cheaper storage; even delete rarely used renditions and re-transcode on demand.

## 7. Bottlenecks and failure modes

| What fails | Impact | Mitigation |
|---|---|---|
| Transcoding worker crash | A chunk isn't encoded | Retry the chunk (idempotent tasks); queue redelivery |
| Transcode backlog | Uploads take longer to go live | Autoscale workers; prioritise; show "processing" |
| CDN edge outage | Viewers in a region affected | Multi-CDN, DNS steering to healthy edges, origin shield |
| Origin overload from misses | Slow starts for long-tail videos | Origin shield, regional caches, request collapsing |
| Viral video | Huge, sudden demand | Already cached at edges; pre-warm for scheduled premieres |

## 8. Wrap-up

A strong answer separates the **upload pipeline** (direct-to-storage, queue, parallel DAG transcoding) from the **watch path** (HLS/DASH segments from a CDN), uses estimates to show the CDN carries the load, and handles view counting asynchronously.

**Likely follow-ups:** How would you add live streaming (lower-latency segments, ingest servers, no full transcode ahead of time)? How would you do recommendations? How do you handle copyright detection (fingerprinting in the pipeline)?
