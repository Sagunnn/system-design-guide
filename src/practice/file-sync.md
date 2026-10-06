---
title: Design a file sync service (like Dropbox)
navTitle: File sync (Dropbox)
order: 10
difficulty: Hard
summary: Store files in the cloud and keep them in sync across devices, efficiently and without losing edits. Tests chunking and deduplication, metadata consistency, sync protocols and conflicts.
cards: file-sync
glance:
  - "Split files into **chunks** identified by **content hash**: upload only changed chunks, and store identical chunks once."
  - "Keep **metadata** (file → ordered chunk list, versions) in a **strongly consistent** SQL store."
  - "Notify other devices of changes (long polling or WebSockets); each device syncs from a **cursor**."
  - "Concurrent edits produce a **conflicted copy** rather than silently overwriting."
---
## 1. Clarify requirements

{% callout "think", "Thinking out loud" %}
"Two things dominate: moving bytes efficiently (big files, small edits, flaky networks) and keeping metadata correct across devices. I'll confirm file size limits, sharing, versioning and offline editing, because offline editing means conflicts."
{% endcallout %}

**Functional**

- Upload and download files (up to ~10 GB) from any device.
- **Automatic sync**: change a file on the laptop, and it updates on the phone.
- **Version history** (restore older versions); **sharing** with other users.
- Works **offline**; syncs when back online.

**Non-functional**

- **Durability**: never lose a file (eleven nines).
- **Consistency** of the file tree: no corrupted or half-synced files.
- **Bandwidth efficiency**: small edits to big files shouldn't re-upload everything.
- Scale: **50M users**, 10M daily active; average user stores **~10 GB**.

## 2. Estimates

- Total storage: 50M × 10 GB = **500 PB** logical; **deduplication** (identical files and chunks across users) and compression cut this substantially, but it's still object storage at massive scale.
- Changes: 10M DAU × ~50 file changes/day = 500M metadata updates/day ≈ **5k/s** average.
- Data written: if each change uploads ~1 MB of new chunks → **500 TB/day** of uploads before dedupe.
- Metadata is **small but critical**: billions of file and chunk rows, so a sharded SQL store.

## 3. API

```
POST /v1/chunks/check     { hashes: [...] }           → which hashes are missing
PUT  {storage}/chunks/{hash}   (pre-signed URL)        upload a missing chunk
POST /v1/files/commit     { path, chunk_hashes[], base_version }
                          → { version }  or  409 Conflict
GET  /v1/changes?cursor=…                              → changed files since cursor
GET  /v1/changes/longpoll?cursor=…                     (waits for changes)
GET  /v1/files/{id}?version=…                          → chunk list → download chunks
```

## 4. Data model

| Data | Store |
|---|---|
| `files(file_id, namespace_id, path, latest_version, is_deleted)` | SQL, sharded by `namespace_id` (a user's or shared folder's tree) |
| `file_versions(file_id, version, chunk_hashes[], size, modified_by, created_at)` | SQL |
| `chunks(hash, size, ref_count)` | SQL / KV |
| Chunk bytes | **Object storage** keyed by content hash |
| `journal(namespace_id, seq, file_id, version)` | SQL: ordered change log per namespace; cursors point into it |

## 5. High-level design

{% diagram "Clients upload chunks straight to storage, commit metadata, and get notified of others' changes" %}
c1: Laptop client\n(watcher, chunker) [client] @ 0,0
c2: Phone client [client] @ 0,2
meta: Metadata\nservice @ 2,1
db: Metadata DB\n(SQL, sharded) [db] @ 3.4,1
blob: Chunk storage\n(object store) [store] @ 2,0
notif: Notification\nservice [lb] @ 2,2
c1 -> blob : upload new chunks
c1 -> meta : commit version
meta -> db : transaction
meta --> notif : namespace changed
notif --> c2 : "changes available"
c2 -> meta : get changes
c2 -> blob : download chunks
{% enddiagram %}

## 6. Deep dives

### Chunking and deduplication

- Split each file into **chunks** (~4 MB) and identify each by its **content hash** (SHA-256).
- To upload, the client sends the hashes; the server replies with **which are missing**; the client uploads only those, directly to object storage via pre-signed URLs.
- Editing one paragraph of a 1 GB file uploads **one chunk**, not 1 GB.
- **Dedupe for free**: identical chunks (the same file uploaded by many users, or unchanged parts of versions) are stored **once**, with reference counts.
- **Content-defined chunking** (boundaries chosen by a rolling hash of the content, not fixed offsets) means inserting bytes near the start doesn't shift every later chunk boundary, so most chunks still match.

{% procon "Fixed-size chunks", "Content-defined chunks" %}
- Simple and fast to compute
- Inserting data shifts every later chunk, so everything after the edit re-uploads
---cons---
- Boundaries follow content (rolling hash, like Rabin fingerprinting)
- Insertions only change nearby chunks, giving much better dedupe and delta sync
- Variable chunk sizes; slightly more CPU
{% endprocon %}

### Committing changes: metadata consistency

- After uploading the chunks, the client **commits** a new version: `{path, chunk_hashes, base_version}`.
- The metadata service runs a **transaction** (SQL, for ACID): check that `base_version` equals the current version, insert the new version, and append to the namespace **journal**.
- If chunks are missing (a race), reject, and the client uploads them and retries. Chunks are referenced only once they're safely stored, so a file never points at missing data.

### Sync protocol: how other devices catch up

- Each device stores a **cursor**: the last journal sequence number it has applied for each namespace.
- The device holds a **long poll** (or WebSocket) to the notification service; when the namespace changes, it's told "changes available".
- It calls `GET /changes?cursor=…`, receives the list of changed files and their new chunk lists, downloads the chunks it doesn't already have locally (local dedupe), and assembles the files.
- Downloads are written to a temp file and **renamed atomically**, so a half-synced file never appears.

### Conflicts

Two devices edit the same file offline. Both try to commit against `base_version = 7`:

- The first commit wins and becomes version 8.
- The second gets **409 Conflict**. Rather than overwrite (data loss) or merge blindly (corruption for binary files), the client saves its copy as **"report (Sagun's conflicted copy).docx"** and syncs both.
- This is simple, safe and understandable. Real-time collaborative editing (Google Docs-style operational transforms or CRDTs) is a different product.

### Sharing and permissions

Shared folders are their own **namespace** with an access-control list. Users mount namespaces into their trees. Sharding metadata by namespace keeps each folder's transactions on one shard.

### Efficiency and security

- **Compression** before upload; **LAN sync** (devices on the same network exchange chunks directly).
- **Encryption** in transit (TLS) and at rest; per-chunk encryption keys are possible.
- **Garbage collection**: delete chunks whose reference count hits zero, after the version-history retention window has passed.

## 7. Bottlenecks and failure modes

| What fails | Impact | Mitigation |
|---|---|---|
| Upload interrupted | Partial file | Chunks are resumable; nothing is committed until all chunks exist |
| Metadata shard down | That namespace can't sync | Replicas with failover; clients keep working offline and retry |
| Notification service down | Devices sync late | Clients fall back to periodic polling with backoff |
| Huge shared folder | Hot metadata shard | Split very large namespaces; cache listings; batch journal reads |
| Concurrent edits | Lost work | Optimistic concurrency (`base_version`) → conflicted copies |

## 8. Wrap-up

A strong answer: **content-hashed chunks** (ideally content-defined) for delta upload and dedupe; **direct-to-storage uploads**; a **strongly consistent metadata store** with versioned commits and an ordered **journal**; **cursor-based sync** triggered by notifications; and an explicit **conflict policy**.

**Likely follow-ups:** How would you support real-time co-editing? How do you implement "restore my folder to last Tuesday" (journal replay)? How would you handle a user with 5 million files (pagination and incremental sync)?
