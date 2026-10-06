---
title: Blob storage and file uploads
navTitle: Blob storage
order: 17
summary: Where to put photos, videos and files, how clients upload large files directly with pre-signed URLs, and how object stores stay durable and cheap.
glance:
  - "Store files in **object storage** (S3, GCS, Azure Blob); keep only **metadata** in your database."
  - "Clients upload **directly to storage** with a short-lived **pre-signed URL**, bypassing your servers."
  - "Large files use **multipart upload**: parallel chunks with resumable retries."
  - "Durability comes from replication and **erasure coding**; cost from **storage tiers** and lifecycle rules."
---
Databases are great for rows, but bad for 5 MB photos and 2 GB videos: they bloat backups, slow replication and cost far more per GB. Big binary data (**blobs**) belongs in **object storage**.

## Block, file and object storage

| Type | Interface | Use |
|---|---|---|
| **Block** | Raw disk volumes (EBS) | Databases, VM disks: low-latency random I/O |
| **File** | Shared filesystem with folders (NFS, EFS) | Legacy apps that need a POSIX filesystem |
| **Object** | `PUT`/`GET` whole objects by key over HTTP (S3) | Media, backups, logs, data lakes: huge scale, cheap |

Object storage is a flat namespace: `bucket/key → bytes + metadata`. It scales almost without limit, is extremely durable, and is cheap, but objects are replaced whole rather than edited in place.

## Uploading: pre-signed URLs

{% diagram "Direct-to-storage upload: the app only signs; bytes go straight to the object store" %}
c: Client [client] @ 0,1
api: App server @ 1,0
db: Metadata DB [db] @ 2,0
s3: Object storage\n(S3) [store] @ 2,2
q: Upload event\nqueue [queue] @ 3,1
c -> api : 1. request upload URL
api -> db : 2. create record
c -> s3 : 3. PUT file (pre-signed)
s3 --> q : 4. "object created"
q --> api : 5. mark ready
{% enddiagram %}

1. The client asks your API for permission to upload.
2. The API creates a metadata row (`status = pending`) and returns a **pre-signed URL**: a time-limited, signed URL that allows one `PUT` to one key.
3. The client uploads the bytes **directly to the object store**. Your servers never touch the file, so they don't need the bandwidth or memory.
4. The store emits an event; a worker validates the file, generates thumbnails or transcodes it, and marks the record `ready`.

Downloads work the same way: a pre-signed `GET` URL, or a [CDN](/topics/cdn/) in front of the bucket.

## Large files: multipart upload

Split the file into parts (say 5–100 MB), upload them in **parallel**, and retry only failed parts; then call "complete". Uploads can be **resumed** after network drops, which matters on mobile. Pair it with checksums to detect corruption.

## Durability and cost

- **Replication**: several full copies across devices or zones. Simple, but 3× storage.
- **Erasure coding**: split data into *k* data chunks plus *m* parity chunks; any *k* of the *k + m* can rebuild it. For example 10 + 4 survives losing 4 chunks with only 1.4× overhead. This is how stores reach "eleven nines" of durability cheaply.
- **Storage tiers**: hot (frequent access) → infrequent → archive (cheap, slow retrieval). **Lifecycle rules** move objects down tiers automatically, for example "after 30 days, move to infrequent access".
- **Deduplication**: store by content hash so identical files are kept once (see the [Dropbox question](/practice/file-sync/)).

{% procon %}
- Practically unlimited scale and very high durability
- Cheap per GB, with tiers for cold data
- Direct uploads and downloads keep load off your servers
- Integrates with CDNs and event notifications
---cons---
- Higher latency than block storage; not for databases
- Objects are immutable; edits mean rewriting the object
- Listing huge buckets is slow; design keys for your access patterns
- Egress (download) bandwidth can be costly without a CDN
{% endprocon %}

{% callout "interview", "In the interview" %}
Any time users upload media, say: "Files go to S3 through pre-signed URLs; the database stores only metadata and the object key; a queue triggers processing; a CDN serves downloads." That one sentence covers most of what's expected.
{% endcallout %}
