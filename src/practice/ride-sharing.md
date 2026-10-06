---
title: Design a ride-sharing service (like Uber)
navTitle: Ride sharing
order: 6
difficulty: Hard
summary: Match riders to nearby drivers in seconds while tracking a million moving cars. Tests geospatial indexing, high-frequency writes and safe concurrent assignment.
cards: ride-sharing
glance:
  - "Driver locations are **high-frequency, ephemeral writes**: keep them **in memory**, not in a disk database."
  - "Find nearby drivers with a **geospatial index**: geohash, quadtree or H3 cells."
  - "Assignment must be **exactly one driver per ride**: offer to one driver at a time, and claim with an atomic conditional update."
  - "Shard naturally **by city / region**; rides are local."
---
## 1. Clarify requirements

{% callout "think", "Thinking out loud" %}
"The hard parts are finding nearby drivers fast while their positions change every few seconds, and never assigning one driver to two riders. I'll keep payments, ratings and surge pricing as extensions."
{% endcallout %}

**Functional**

- Drivers go online and **stream their location**.
- A rider requests a ride (pickup, destination) and sees **nearby drivers** and an ETA.
- The system **matches** the rider with a nearby driver, who accepts or declines.
- Both see **live location** during the trip; the trip completes and gets a fare.

**Non-functional**

- **Fast matching** (a few seconds).
- **Consistency for assignment**: a driver can't be matched to two rides.
- **High availability**; location data may be slightly stale (seconds).
- Scale: **1M online drivers** at peak, each sending location **every 4 seconds**; **10M rides/day**.

## 2. Estimates

- Location updates: 1M ÷ 4 s = **250k writes/s**. This is the dominant load.
- Location state: 1M × ~100 bytes ≈ **100 MB**. Tiny: it fits in memory easily.
- Ride requests: 10M/day ≈ **~115/s** average, maybe **~1k/s** at peak in busy hours.
- Nearby search reads: riders open the app and watch cars move, so maybe **100k+/s**, served from the same in-memory index.

{% callout "think", "Thinking out loud" %}
"Two hundred and fifty thousand writes a second of data that's useless after ten seconds shouldn't go into a disk database. It belongs in memory, sharded by region. Only trip records, which are low volume and must be durable, go to a real database."
{% endcallout %}

## 3. API

```
Driver (over a persistent connection):
  → location   { driver_id, lat, lng, heading, ts }      every ~4 s
  ← ride_offer { ride_id, pickup, expires_in: 15s }
  → accept     { ride_id }   /   decline

Rider:
  POST /v1/rides            { pickup, dropoff }    → { ride_id, status: searching }
  GET  /v1/rides/{id}       (or a WebSocket for live updates)
  GET  /v1/drivers/nearby?lat=…&lng=…&radius=2km
```

## 4. Data model

| Data | Store |
|---|---|
| Live driver locations + status (`available`, `on_trip`) | **In-memory geospatial index** (Redis GEO or a custom quadtree service), sharded by region |
| Rides `(ride_id, rider_id, driver_id, status, pickup, dropoff, fare, timestamps)` | **SQL**: transactions and a state machine (requested → matched → arriving → in progress → completed) |
| Trip location history | Append-only store (Cassandra / object storage) for receipts and analytics |

## 5. High-level design

{% diagram "Location updates feed an in-memory geo index; matching reads it and offers rides to drivers" %}
drv: Driver app [client] @ 0,0
rid: Rider app [client] @ 0,2
gw: Connection\ngateway [lb] @ 1,1
loc: Location\nservice @ 2,0
geo: Geo index\n(in memory, by city) [cache] @ 3.35,0
ride: Ride service @ 2,2
match: Matching\nservice @ 3.35,1.2
db: Rides DB\n(SQL) [db] @ 3.35,2.4
drv <-> gw : location / offers
rid <-> gw : requests / updates
gw -> loc
loc -> geo : update
gw -> ride : request ride
ride -> match
match -> geo : nearest available
ride -> db : state changes
match --> gw : offer to driver
{% enddiagram %}

## 6. Deep dives

### Geospatial indexing: finding nearby drivers

Plain `lat/lng` columns don't index well for "within 2 km". Three standard approaches:

- **Geohash**: encode a location as a string in which a shared prefix means nearby (`tdr1y…`). Each extra character makes the cell smaller. To search, look in the user's cell **plus its 8 neighbours** (nearby points can fall across a cell boundary). Easy to shard and to store in Redis (`GEOADD`, `GEOSEARCH`).
- **Quadtree**: recursively split the map into four until each cell holds at most N drivers. It adapts to density (Manhattan gets tiny cells, rural areas big ones). Lives in memory, but rebalancing with moving points takes care.
- **H3** (Uber's hexagonal grid): hexagons have uniform neighbour distances, which is nice for ETAs and surge zones. You search with "k-ring" neighbour lookups.

{% procon "Geohash / H3 cells", "Quadtree" %}
- Simple fixed cells; easy to store in Redis or KV stores
- Easy to shard by cell prefix or region
- Fixed cell size: dense areas get crowded cells
---cons---
- Adapts to density automatically
- Efficient nearest-neighbour search
- Custom in-memory service; updating moving points is more complex
{% endprocon %}

{% callout "think", "My choice" %}
"Geohash in a Redis cluster, sharded by city, is simple and well understood: update with `GEOADD` and query with `GEOSEARCH` in a 2 km radius, filtering by `available`. If we needed density-adaptive cells or uniform neighbour distances for pricing, I'd move to H3."
{% endcallout %}

### Handling 250k location writes per second

- Keep only the **latest position** per driver, in memory, overwritten on each update. No history in the hot path.
- **Shard by region** (city or geohash prefix), so each shard handles its city's drivers.
- Drop updates older than the stored timestamp (out-of-order arrival); expire drivers with no update for ~30 s (offline).
- Write trip breadcrumbs to a durable store **asynchronously**, through a queue, for receipts and fraud checks.

### Matching without double assignment

1. Matching queries the geo index for the **nearest available drivers**, ranked by ETA (from a routing service), not straight-line distance.
2. It **offers the ride to one driver at a time** (or a small batch), with a ~15 s timeout.
3. On accept, it **claims** the driver atomically: a conditional update, `UPDATE drivers SET status = 'on_trip', ride_id = ? WHERE id = ? AND status = 'available'`, or the Redis equivalent. Only one ride can win.
4. If the claim fails or the driver declines or times out, offer to the next candidate.

The ride itself is a **state machine** in SQL, with transitions guarded by its current state, so retries and race conditions can't put it in an invalid state.

### ETA and routing

ETA comes from a routing service over the road graph, with live traffic. Precompute and cache routes between nearby cells to keep matching fast.

### Sharding by geography

Rides are local: a rider in Kathmandu never matches a driver in London. **Shard everything hot by city or region**: geo index, matching, even ride services. That bounds each shard's load and makes regional failures independent. Cross-region trips (airports near boundaries) need a little care at shard edges.

### Surge pricing (extension)

Compute supply (available drivers) and demand (requests) per cell over a sliding window with stream processing; raise prices in cells where demand outstrips supply.

## 7. Bottlenecks and failure modes

| What fails | Impact | Mitigation |
|---|---|---|
| Geo index shard dies | A city can't match briefly | Replicas; or simply rebuild: drivers resend location every 4 s, so state recovers within seconds |
| Gateway dies | Drivers and riders disconnect | Clients reconnect with backoff; state lives in services, not the gateway |
| Driver phone loses signal | Stale location | Timestamp-based expiry; don't offer rides to stale drivers |
| Two rides claim one driver | Double booking | Atomic conditional claim; state-machine transitions |
| Big event ends | Demand spike in one cell | Surge pricing, request batching, queue requests briefly |

## 8. Wrap-up

A strong answer: estimates show location writes dominate → **in-memory, region-sharded geo index**; a clear geospatial choice (geohash / quadtree / H3) with trade-offs; **one-at-a-time offers + atomic claim** to prevent double assignment; a ride state machine in SQL; and recovery by resending, not replication.

**Likely follow-ups:** How would you do pooled rides (multiple riders, route insertion)? How do you compute accurate ETAs at scale? How would you detect GPS spoofing?
