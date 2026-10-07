// Design Lab: the component palette and the scenarios with their scoring rules.
//
// Rules are matched against the user's canvas (component types + links, links are undirected):
//   need:  { t: "lb" | "sql|nosql", pts, why }            component present
//   link:  { a: "client", b: "lb|cdn", pts, why }          a link between those types
//   min:   { t: "queue", n: 2, pts, why }                  at least n of a type
//   bonus: { t } or { a, b } with pts, why                 nice extras, added on top
//   avoid: { t, unless? } or { a, b } with pts, why        anti-patterns, subtracted
// The model answer for each practice question is the main diagram from its walkthrough page,
// so the "best design" always matches the guide.

import { readFileSync } from "node:fs";
import icons from "./labIcons.js";

function walkthroughDiagram(slug) {
  const md = readFileSync(new URL(`../practice/${slug}.md`, import.meta.url), "utf8");
  const m = md.match(/{% diagram "([^"]*)" %}\n([\s\S]*?){% enddiagram %}/);
  return { caption: m[1], spec: m[2] };
}

const components = [
  { t: "client", label: "Client", kind: "client", hint: "Browser or mobile app making requests" },
  { t: "dns", label: "DNS", kind: "ext", hint: "Turns names into addresses; can steer traffic by region" },
  { t: "cdn", label: "CDN", kind: "cdn", hint: "Edge caches close to users for static and media files", tech: [{ k: "cloudflare", label: "Cloudflare" }, { k: "cloudfront", label: "CloudFront" }, { k: "akamai", label: "Akamai" }] },
  { t: "lb", label: "Load balancer", kind: "lb", hint: "Spreads requests across servers and skips dead ones", tech: [{ k: "l7", label: "L7 (HTTP)" }, { k: "l4", label: "L4 (TCP)" }] },
  { t: "gateway", label: "API gateway + rate limiter", kind: "lb", hint: "Front door: auth, routing and rate limits", tech: [{ k: "envoy", label: "Envoy / Kong" }, { k: "apigw", label: "AWS API Gateway" }] },
  { t: "ws", label: "Realtime gateway", kind: "lb", hint: "Holds WebSocket / long-poll connections to push updates", tech: [{ k: "websocket", label: "WebSockets" }, { k: "sse", label: "SSE / long polling" }] },
  { t: "app", label: "App servers", kind: "service", hint: "Stateless services running your business logic" },
  { t: "cache", label: "Cache (Redis)", kind: "cache", hint: "In-memory key-value store for hot data and counters", tech: [{ k: "redis", label: "Redis" }, { k: "memcached", label: "Memcached" }] },
  { t: "sql", label: "SQL database", kind: "db", hint: "Relational, ACID transactions, joins (Postgres, MySQL)", tech: [{ k: "postgres", label: "PostgreSQL" }, { k: "mysql", label: "MySQL" }, { k: "aurora", label: "Amazon Aurora" }, { k: "cockroach", label: "CockroachDB" }, { k: "spanner", label: "Cloud Spanner" }] },
  { t: "replica", label: "Read replicas", kind: "db", hint: "Copies of the primary DB that serve reads", tech: [{ k: "async", label: "Async replicas" }, { k: "sync", label: "Sync replica" }] },
  { t: "nosql", label: "NoSQL / wide-column DB", kind: "db", hint: "Huge scale, simple access patterns (Cassandra, DynamoDB)", tech: [{ k: "cassandra", label: "Cassandra" }, { k: "scylla", label: "ScyllaDB" }, { k: "dynamodb", label: "DynamoDB" }, { k: "mongodb", label: "MongoDB" }, { k: "bigtable", label: "Bigtable" }] },
  { t: "blob", label: "Object storage", kind: "store", hint: "Cheap, durable storage for files and media (S3)", tech: [{ k: "s3", label: "Amazon S3" }, { k: "gcs", label: "Cloud Storage" }, { k: "azure", label: "Azure Blob" }] },
  { t: "queue", label: "Message queue", kind: "queue", hint: "Buffers work between services (Kafka, SQS)", tech: [{ k: "kafka", label: "Kafka" }, { k: "sqs", label: "SQS" }, { k: "rabbitmq", label: "RabbitMQ" }, { k: "pubsub", label: "Pub/Sub" }] },
  { t: "worker", label: "Workers", kind: "worker", hint: "Background jobs that consume from queues" },
  { t: "idgen", label: "ID generator", kind: "worker", hint: "Hands out unique IDs (Snowflake, ticket ranges)" },
  { t: "search", label: "Search index", kind: "db", hint: "Full-text and fuzzy search (Elasticsearch)", tech: [{ k: "elastic", label: "Elasticsearch" }, { k: "opensearch", label: "OpenSearch" }] },
  { t: "geo", label: "Geo index (in memory)", kind: "cache", hint: "Answers 'what's near this point?' fast", tech: [{ k: "redisgeo", label: "Redis GEO" }, { k: "h3", label: "H3 / S2 cells" }] },
  { t: "push", label: "Push / SMS / email provider", kind: "ext", hint: "Third parties: APNs, FCM, Twilio, SES" },
];

const scenarios = [
  {
    id: "web-app",
    title: "Scale a web app to 1M users",
    level: "Warm-up",
    brief: [
      "A photo-sharing site growing from 1k to **1M daily users**.",
      "Reads outnumber writes **50 : 1**; photos are a few MB each.",
      "It must keep working when any single server dies.",
    ],
    need: [
      { t: "lb", pts: 10, why: "A load balancer spreads traffic over several servers and routes around a dead one." },
      { t: "app", pts: 10, why: "Stateless app servers can be added or removed freely behind the load balancer." },
      { t: "sql|nosql", pts: 10, why: "A database holds users, photos' metadata, likes and comments." },
      { t: "cache", pts: 10, why: "With 50 reads per write, a cache takes most of the load off the database." },
      { t: "blob", pts: 10, why: "Photos belong in object storage, not in the database or on app servers' disks." },
      { t: "cdn", pts: 10, why: "A CDN serves photos and static files from near the user and spares your servers." },
    ],
    link: [
      { a: "client", b: "lb", pts: 8, why: "API requests should reach the app through the load balancer." },
      { a: "lb", b: "app", pts: 8, why: "The load balancer forwards to the app servers." },
      { a: "app", b: "cache", pts: 8, why: "App servers check the cache before the database (cache-aside)." },
      { a: "app", b: "sql|nosql", pts: 8, why: "App servers read and write the database." },
      { a: "client", b: "cdn", pts: 6, why: "Browsers load photos from the CDN, not your servers." },
      { a: "cdn", b: "blob", pts: 6, why: "The CDN pulls from object storage on a cache miss." },
    ],
    bonus: [
      { t: "replica", pts: 6, why: "Read replicas add read capacity and a standby if the primary fails." },
      { t: "queue", pts: 4, why: "A queue lets thumbnails and notifications happen in the background." },
    ],
    avoid: [],
    notes: [
      "Users get static files and photos from the **CDN** and API calls through the **load balancer**.",
      "**Stateless app servers** behind the balancer scale out and survive single failures.",
      "**Cache-aside** in front of the database absorbs the 50 : 1 read load; **read replicas** add more.",
      "Photos live in **object storage**; the database only stores their keys.",
    ],
    model: {
      caption: "A scaled web app: CDN for files, a load-balanced stateless tier, cache, primary + replicas, object storage",
      spec: `u: Users [client] @ 0,1
cdn: CDN [cdn] @ 1,0
blob: Object storage [store] @ 2,0
lb: Load balancer [lb] @ 1,2
app: App servers\\n(stateless) @ 2,2
cache: Cache\\n(Redis) [cache] @ 3,1
db: Primary DB\\n(SQL) [db] @ 3,2.3
rep: Read replicas [db] @ 3,3.5
u -> cdn : photos, JS
u -> lb : API
cdn --> blob : miss
lb -> app
app -> blob : uploads
app -> cache
app -> db : writes
app -> rep : reads
db --> rep : replicate
`,
    },
  },
  {
    id: "url-shortener",
    title: "URL shortener",
    level: "Easy",
    brief: [
      "Turn long URLs into short codes and redirect anyone who opens one.",
      "**100M new URLs a month**, read **100×** more often than written.",
      "Redirects must be fast (under ~50 ms) and links must never break.",
    ],
    need: [
      { t: "lb", pts: 10, why: "A load balancer in front of the services handles traffic spikes and failures." },
      { t: "app", pts: 10, why: "Services to create codes and to look them up for redirects." },
      { t: "cache", pts: 14, why: "Reads are 100× writes and popular links are very popular: cache them." },
      { t: "nosql|sql", pts: 10, why: "A key-value style store maps code → long URL; billions of rows, simple lookups." },
    ],
    link: [
      { a: "client", b: "lb", pts: 8, why: "Requests enter through the load balancer." },
      { a: "lb", b: "app", pts: 8, why: "The balancer routes to the shorten and redirect services." },
      { a: "app", b: "cache", pts: 10, why: "Redirects check the cache first." },
      { a: "app", b: "nosql|sql", pts: 8, why: "Codes are saved to and (on a cache miss) read from the store." },
    ],
    bonus: [
      { t: "idgen", pts: 6, why: "An ID generator (or ticket ranges) gives unique codes with no collision checks." },
      { t: "queue", pts: 4, why: "Click analytics go through a queue so redirects stay fast." },
    ],
    avoid: [],
  },
  {
    id: "rate-limiter",
    title: "Distributed rate limiter",
    level: "Medium",
    brief: [
      "Limit each API client to, say, **100 requests per minute**, across **dozens of gateway servers**.",
      "Adds at most a millisecond or two to each request.",
      "Over-limit requests get **429 Too Many Requests**.",
    ],
    need: [
      { t: "gateway", pts: 16, why: "Enforce limits at the API gateway, before traffic reaches your services." },
      { t: "cache", pts: 14, why: "Counters live in a shared in-memory store (Redis) so every gateway sees the same count." },
      { t: "app", pts: 8, why: "The backend services the limiter protects." },
    ],
    link: [
      { a: "client|lb", b: "gateway", pts: 10, why: "All traffic passes through the gateway." },
      { a: "gateway", b: "cache", pts: 12, why: "The gateway checks and increments counters atomically (Lua script)." },
      { a: "gateway", b: "app", pts: 8, why: "Allowed requests continue to the backend." },
    ],
    bonus: [{ t: "lb", pts: 3, why: "A load balancer spreads traffic across the gateway fleet." }],
    avoid: [
      { a: "gateway", b: "sql", pts: 10, why: "Counting in a disk-based SQL database on every request adds latency and load. Use Redis." },
    ],
  },
  {
    id: "chat-system",
    title: "Chat system",
    level: "Hard",
    brief: [
      "One-to-one and group chat with **real-time delivery**, like WhatsApp.",
      "**50M daily users**, ~**2B messages a day**; history kept forever.",
      "Offline users get a push notification.",
    ],
    need: [
      { t: "ws", pts: 12, why: "A realtime gateway keeps a persistent connection per device to push messages instantly." },
      { t: "app", pts: 8, why: "A chat service stores and routes each message." },
      { t: "nosql", pts: 12, why: "Billions of append-only messages a day suit a wide-column store partitioned by conversation." },
      { t: "cache", pts: 8, why: "A session registry in Redis records which gateway each user is connected to." },
      { t: "push", pts: 8, why: "Users who are offline need a push notification (APNs / FCM)." },
    ],
    link: [
      { a: "client", b: "ws", pts: 8, why: "Clients connect to the realtime gateway." },
      { a: "ws", b: "app", pts: 8, why: "Gateways hand messages to the chat service." },
      { a: "app", b: "nosql", pts: 8, why: "Persist every message before acknowledging it." },
      { a: "app", b: "cache", pts: 6, why: "Look up where the recipient is connected." },
      { a: "app|worker|queue", b: "push", pts: 6, why: "Offline recipients are reached through the push provider." },
    ],
    bonus: [
      { t: "queue", pts: 4, why: "A queue decouples delivery, fan-out to groups, and push." },
      { t: "lb", pts: 3, why: "A load balancer spreads new connections across gateways." },
    ],
    avoid: [
      { t: "sql", unless: "nosql", pts: 8, why: "A single SQL database for billions of messages a day becomes the bottleneck; a wide-column store fits better." },
    ],
  },
  {
    id: "news-feed",
    title: "News feed (like X / Twitter)",
    level: "Hard",
    brief: [
      "Users post; followers see a **home timeline** of recent posts.",
      "**200M daily users**; timelines are read far more than posts are written.",
      "Timeline loads must be fast; a post can take a few seconds to appear.",
    ],
    need: [
      { t: "lb", pts: 8, why: "Front the post and timeline services with a load balancer." },
      { t: "app", pts: 8, why: "Post and timeline services." },
      { t: "queue", pts: 10, why: "New posts go on a queue so fan-out happens asynchronously." },
      { t: "worker", pts: 10, why: "Fan-out workers push post IDs into followers' timelines." },
      { t: "cache", pts: 12, why: "Precomputed timelines (lists of post IDs) live in Redis for instant reads." },
      { t: "nosql|sql", pts: 8, why: "A store for the posts themselves and the follower graph." },
    ],
    link: [
      { a: "client", b: "lb", pts: 6, why: "Requests come through the load balancer." },
      { a: "lb", b: "app", pts: 6, why: "The balancer routes to the services." },
      { a: "app", b: "queue", pts: 8, why: "Publishing a post emits an event." },
      { a: "queue", b: "worker", pts: 8, why: "Workers consume post events." },
      { a: "worker", b: "cache", pts: 10, why: "Workers write post IDs into each follower's timeline." },
      { a: "app", b: "cache", pts: 6, why: "Reading a timeline is one cache lookup." },
      { a: "app", b: "nosql|sql", pts: 6, why: "Hydrate post IDs into full posts." },
    ],
    bonus: [
      { t: "cdn", pts: 3, why: "Media in posts is served from a CDN." },
      { t: "blob", pts: 3, why: "Images and video go to object storage." },
    ],
    avoid: [],
  },
  {
    id: "video-streaming",
    title: "Video streaming (like YouTube)",
    level: "Hard",
    brief: [
      "Creators upload videos; viewers stream them smoothly on any connection.",
      "**500k uploads a day**; at peak, **millions of concurrent viewers**.",
      "Videos can take a few minutes to become watchable.",
    ],
    need: [
      { t: "app", pts: 6, why: "An API for uploads and metadata." },
      { t: "blob", pts: 12, why: "Raw uploads and transcoded segments are huge: object storage." },
      { t: "queue", pts: 8, why: "A finished upload triggers transcoding through a queue." },
      { t: "worker", pts: 10, why: "Transcoding workers turn each video into many resolutions in parallel." },
      { t: "cdn", pts: 14, why: "Terabits of playback traffic can only come from CDN edges." },
      { t: "sql|nosql", pts: 6, why: "Video metadata: title, owner, status, renditions." },
    ],
    link: [
      { a: "client", b: "cdn", pts: 10, why: "Players fetch video segments from the CDN." },
      { a: "cdn", b: "blob", pts: 8, why: "The CDN pulls segments from storage on a miss." },
      { a: "blob|app", b: "queue", pts: 6, why: "An uploaded video produces a transcode job." },
      { a: "queue", b: "worker", pts: 8, why: "Workers pick up transcode jobs." },
      { a: "worker", b: "blob", pts: 6, why: "Workers write segments back to storage." },
      { a: "app", b: "sql|nosql", pts: 4, why: "The API stores and reads metadata." },
      { a: "client", b: "app|lb", pts: 4, why: "Clients call the API for metadata and to start uploads." },
    ],
    bonus: [{ a: "client", b: "blob", pts: 5, why: "Uploading straight to object storage (pre-signed URLs) keeps big files off your servers." }],
    avoid: [],
  },
  {
    id: "ride-sharing",
    title: "Ride sharing (like Uber)",
    level: "Hard",
    brief: [
      "Riders request rides; the system matches them with **nearby available drivers**.",
      "**1M active drivers** send their location **every 4 seconds**.",
      "A driver must never be assigned to two rides at once.",
    ],
    need: [
      { t: "ws|lb", pts: 8, why: "A connection gateway for constant location updates and ride offers." },
      { t: "app", pts: 8, why: "Location, matching and ride services." },
      { t: "geo", pts: 16, why: "250k location writes a second, queried by distance: an in-memory geo index, not a database." },
      { t: "sql", pts: 10, why: "Rides and payments need transactions, so a SQL database." },
    ],
    link: [
      { a: "client", b: "ws|lb", pts: 8, why: "Driver and rider apps connect through the gateway." },
      { a: "ws|lb", b: "app", pts: 8, why: "The gateway forwards to the services." },
      { a: "app", b: "geo", pts: 10, why: "Location updates go in; matching asks for the nearest drivers." },
      { a: "app", b: "sql", pts: 8, why: "Ride state is written with conditional updates, so a driver can't be double-booked." },
    ],
    bonus: [
      { t: "queue", pts: 4, why: "Ride events stream to billing, analytics and notifications." },
      { t: "ws", pts: 3, why: "WebSockets let you push ride offers to drivers instantly." },
    ],
    avoid: [{ t: "nosql", unless: "sql", pts: 5, why: "Without a transactional store it's hard to stop a driver being assigned twice." }],
  },
  {
    id: "web-crawler",
    title: "Web crawler",
    level: "Medium",
    brief: [
      "Crawl **1 billion pages a month** for a search index.",
      "Be polite: obey robots.txt, and never hammer one site.",
      "Don't fetch the same URL twice.",
    ],
    need: [
      { t: "queue", pts: 14, why: "The URL frontier is a queue (prioritised, one lane per host for politeness)." },
      { t: "worker", pts: 14, why: "Fetcher and parser workers download pages and extract links." },
      { t: "blob", pts: 12, why: "Hundreds of TB of page content go to object storage." },
      { t: "cache", pts: 10, why: "A Bloom filter of seen URLs (and a robots.txt cache) stops repeats cheaply." },
    ],
    link: [
      { a: "queue", b: "worker", pts: 12, why: "Workers take the next URL from the frontier." },
      { a: "worker", b: "blob", pts: 10, why: "Fetched pages are stored." },
      { a: "worker", b: "cache", pts: 8, why: "Extracted links are checked against the seen-URL filter." },
      { a: "cache", b: "queue", pts: 8, why: "Only unseen URLs go back into the frontier." },
    ],
    bonus: [{ t: "dns", pts: 5, why: "A local DNS cache: crawlers resolve the same hosts constantly." }],
    avoid: [{ t: "lb", pts: 3, why: "A crawler has no user traffic, so it doesn't need a load balancer in front." }],
    noClient: true,
  },
  {
    id: "notification-system",
    title: "Notification system",
    level: "Medium",
    brief: [
      "Any service can send push, SMS or email to users.",
      "**10M notifications a day**, with bursts of millions during campaigns.",
      "Respect user preferences; one-time codes must never be delayed by marketing.",
    ],
    need: [
      { t: "app", pts: 8, why: "One notification API for every service." },
      { t: "queue", pts: 10, why: "Queues absorb bursts and make sending asynchronous." },
      { t: "worker", pts: 10, why: "Channel workers call the providers and retry failures." },
      { t: "push", pts: 10, why: "Third-party providers actually deliver (APNs/FCM, SMS gateway, email service)." },
      { t: "cache|sql", pts: 6, why: "User preferences and opt-outs, checked before sending." },
    ],
    min: [{ t: "queue", n: 2, pts: 10, why: "A queue per channel (or priority) so a slow SMS provider can't block push or email." }],
    link: [
      { a: "app", b: "queue", pts: 8, why: "The API enqueues instead of sending inline." },
      { a: "queue", b: "worker", pts: 8, why: "Workers consume from the queues." },
      { a: "worker", b: "push", pts: 10, why: "Workers hand messages to the providers." },
      { a: "app", b: "cache|sql", pts: 6, why: "The API checks preferences before enqueueing." },
    ],
    bonus: [{ t: "nosql", pts: 3, why: "A notification log (sent, delivered, opened) fits a wide-column store." }],
    avoid: [{ a: "app", b: "push", pts: 6, why: "Calling providers straight from the API means one slow provider stalls every request. Queue it." }],
    noClient: true,
  },
  {
    id: "typeahead",
    title: "Search autocomplete",
    level: "Medium",
    brief: [
      "Suggest the top completions as someone types, like a search box.",
      "**5B suggestion requests a day**; each answer in **under 100 ms**.",
      "Suggestions can be a day old (plus trending terms).",
    ],
    need: [
      { t: "cdn", pts: 10, why: "Popular short prefixes are identical for everyone: cache them at the edge." },
      { t: "app", pts: 8, why: "A suggest service answers prefix lookups." },
      { t: "cache", pts: 14, why: "An in-memory trie with precomputed top-k per prefix answers in microseconds." },
      { t: "queue", pts: 8, why: "Search logs stream into the offline pipeline." },
      { t: "worker", pts: 10, why: "An aggregation job counts queries and builds new trie snapshots." },
    ],
    link: [
      { a: "client", b: "cdn", pts: 8, why: "Requests hit the edge cache first." },
      { a: "cdn|lb", b: "app", pts: 6, why: "Cache misses go to the suggest service." },
      { a: "app", b: "cache", pts: 10, why: "The service reads the in-memory trie." },
      { a: "queue", b: "worker", pts: 8, why: "The aggregation job consumes the logs." },
      { a: "worker", b: "cache|blob", pts: 6, why: "New trie snapshots are built and loaded." },
    ],
    bonus: [{ t: "blob", pts: 4, why: "Snapshots stored in object storage make rollback instant." }],
    avoid: [{ a: "app", b: "sql", pts: 10, why: "A SQL LIKE 'prefix%' query on every keystroke is far too slow at this scale." }],
  },
  {
    id: "file-sync",
    title: "File sync (like Dropbox)",
    level: "Hard",
    brief: [
      "Keep files in sync across a user's devices; share folders.",
      "**50M users**, ~10 GB each; small edits to big files shouldn't re-upload everything.",
      "Never lose a file; never show a half-synced one.",
    ],
    need: [
      { t: "blob", pts: 12, why: "File chunks (content-hashed) live in object storage." },
      { t: "sql", pts: 12, why: "File metadata and versions need transactions: a SQL database." },
      { t: "app", pts: 8, why: "A metadata service commits new versions." },
      { t: "ws", pts: 10, why: "A notification channel tells other devices that something changed." },
    ],
    link: [
      { a: "client", b: "blob", pts: 10, why: "Clients upload and download chunks directly (pre-signed URLs)." },
      { a: "client", b: "app|lb", pts: 6, why: "Clients commit versions and fetch change lists through the API." },
      { a: "app", b: "sql", pts: 8, why: "Each commit is a transaction with a version check." },
      { a: "app|queue", b: "ws", pts: 6, why: "A commit triggers a 'changes available' notification." },
      { a: "client", b: "ws", pts: 6, why: "Devices hold a long poll or WebSocket for notifications." },
    ],
    bonus: [{ t: "cache", pts: 3, why: "Cache folder listings and hot metadata." }],
    avoid: [{ t: "nosql", unless: "sql", pts: 6, why: "Metadata needs atomic, versioned commits; an eventually consistent store risks corrupt file trees." }],
  },
];

const notes = {
  "url-shortener": [
    "A **load balancer** fronts separate **shorten** and **redirect** paths.",
    "Redirects are a **cache-aside** lookup; most hit Redis and never touch the store.",
    "A **key-value store** (replicated) holds billions of code → URL rows.",
    "An **ID generator** hands out unique codes; clicks go to a **queue** for analytics.",
  ],
  "rate-limiter": [
    "The limiter lives in the **API gateway**, so bad traffic is stopped before it reaches services.",
    "Counters sit in **Redis**, updated atomically with a Lua script so gateways never race.",
    "Rules come from a config service and are cached in each gateway.",
  ],
  "chat-system": [
    "**Realtime gateways** hold a connection per device; a **session registry** knows who is where.",
    "The **chat service** persists each message (wide-column store, partitioned by conversation) before acking.",
    "Offline users get **push notifications**.",
  ],
  "news-feed": [
    "Posting puts an event on a **queue**; **fan-out workers** push the post ID into followers' **timeline caches**.",
    "Reading a timeline is one cache read, then a batch lookup to hydrate posts.",
    "Celebrities are the exception: their posts are merged in at read time (hybrid fan-out).",
  ],
  "video-streaming": [
    "Uploads go **straight to object storage**; a **queue** triggers parallel **transcoding workers**.",
    "Viewers stream segments from the **CDN**, which pulls from storage on a miss.",
    "Metadata (status, renditions) lives in a database; the bytes never touch app servers.",
  ],
  "ride-sharing": [
    "Driver locations go to an **in-memory geo index** sharded by city: fast writes, nearest-driver queries.",
    "**Matching** reads the geo index and offers the ride to one driver at a time.",
    "Ride state lives in **SQL** with conditional updates, so a driver can't be double-booked.",
  ],
  "web-crawler": [
    "The **URL frontier** (queue) balances priority and per-host politeness.",
    "**Fetchers** obey robots.txt, store pages in **object storage**, and hand pages to **parsers**.",
    "A **Bloom filter** drops URLs already seen; only new ones return to the frontier.",
  ],
  "notification-system": [
    "One **notification API** checks preferences, then enqueues.",
    "**Separate queues per channel** (and per priority) isolate slow providers and protect one-time codes.",
    "**Workers** retry with backoff and record results; idempotency keys prevent duplicates.",
  ],
  typeahead: [
    "The **CDN** answers popular prefixes; misses go to the **suggest service**.",
    "Suggestions come from an **in-memory trie** with top-k precomputed at every node.",
    "An offline **aggregation job** builds new trie snapshots from search logs.",
  ],
  "file-sync": [
    "Clients split files into **content-hashed chunks** and upload only missing ones, **directly to storage**.",
    "The **metadata service** commits each version in a **SQL transaction** and appends to a change journal.",
    "A **notification service** tells other devices to fetch changes since their cursor.",
  ],
};

for (const s of scenarios) {
  if (!s.model) {
    s.model = walkthroughDiagram(s.id);
    s.notes = notes[s.id];
    s.walkthrough = `/practice/${s.id}/`;
  }
}


// Capacity calculator: rough per-node capacities, editable on the page as assumptions.
const profiles = {
  lb: { l7: { rps: 25000, label: "L7" }, l4: { rps: 250000, label: "L4" } },
  // writes/s per primary or node, reads/s per replica or node, TB per node, distributed = scales out by adding nodes
  db: {
    postgres: { label: "PostgreSQL", writes: 5000, reads: 10000, tb: 4, distributed: false },
    mysql: { label: "MySQL", writes: 5000, reads: 10000, tb: 4, distributed: false },
    aurora: { label: "Aurora", writes: 10000, reads: 15000, tb: 64, distributed: false },
    cockroach: { label: "CockroachDB", writes: 2000, reads: 8000, tb: 2, distributed: true },
    spanner: { label: "Spanner", writes: 1800, reads: 10000, tb: 4, distributed: true },
    cassandra: { label: "Cassandra", writes: 10000, reads: 5000, tb: 2, distributed: true },
    scylla: { label: "ScyllaDB", writes: 40000, reads: 20000, tb: 4, distributed: true },
    dynamodb: { label: "DynamoDB", writes: 1000, reads: 3000, tb: 10, distributed: true, managed: true },
    mongodb: { label: "MongoDB", writes: 5000, reads: 10000, tb: 2, distributed: true },
    bigtable: { label: "Bigtable", writes: 10000, reads: 10000, tb: 5, distributed: true },
  },
};

// dau, rpu = requests per user per day, peak = peak / average, edge = % served by CDN or edge,
// cpuMs / respMs / mbReq = per request, util = target CPU %, reads = DB reads per request, hit = cache hit %,
// recDay / recBytes / years / rf = new DB records, filesDay / fileMB = object storage,
// jobsDay / jobCpuS = background work, conns = concurrent persistent connections
const base = { dau: 1e6, rpu: 50, peak: 3, edge: 0, cpuMs: 20, respMs: 100, mbReq: 2, util: 60, size: "auto",
  reads: 1, hit: 80, recDay: 1e6, recBytes: 1000, years: 5, rf: 3, filesDay: 0, fileMB: 1, jobsDay: 0, jobCpuS: 1, conns: 0 };
const calc = {
  "web-app": { dau: 1e6, rpu: 50, cpuMs: 20, respMs: 150, reads: 2, hit: 80, recDay: 1e6, recBytes: 1000, filesDay: 2e5, fileMB: 3, jobsDay: 2e5, jobCpuS: 2 },
  "url-shortener": { dau: 1e7, rpu: 33, cpuMs: 5, respMs: 30, reads: 1, hit: 90, recDay: 3.3e6, recBytes: 500 },
  "rate-limiter": { dau: 2e7, rpu: 100, cpuMs: 1, respMs: 5, reads: 0, hit: 0, recDay: 0, recBytes: 0 },
  "chat-system": { dau: 5e7, rpu: 60, cpuMs: 4, respMs: 20, reads: 1, hit: 50, recDay: 2e9, recBytes: 200, conns: 2e7 },
  "news-feed": { dau: 2e8, rpu: 20, cpuMs: 10, respMs: 80, reads: 1, hit: 95, recDay: 1e8, recBytes: 1000, filesDay: 2e7, fileMB: 0.5, jobsDay: 1e8, jobCpuS: 0.05 },
  "video-streaming": { dau: 1e8, rpu: 30, cpuMs: 10, respMs: 60, reads: 1, hit: 90, recDay: 5e5, recBytes: 2000, filesDay: 5e5, fileMB: 600, jobsDay: 5e5, jobCpuS: 1800 },
  "ride-sharing": { dau: 1e6, rpu: 21600, peak: 1.5, cpuMs: 0.5, respMs: 5, reads: 0.05, hit: 0, recDay: 2e7, recBytes: 500, conns: 1.5e6 },
  "web-crawler": { dau: 0, rpu: 0, peak: 1.2, reads: 0, hit: 0, recDay: 3.3e7, recBytes: 300, years: 2, filesDay: 3.3e7, fileMB: 0.1, jobsDay: 3.3e7, jobCpuS: 0.3 },
  "notification-system": { dau: 1e7, rpu: 1, peak: 10, cpuMs: 5, respMs: 20, reads: 2, hit: 90, recDay: 1e7, recBytes: 1000, years: 0.25, jobsDay: 1e7, jobCpuS: 0.05 },
  typeahead: { dau: 1e8, rpu: 50, edge: 50, cpuMs: 0.5, respMs: 5, reads: 0, hit: 0, recDay: 0, recBytes: 0, jobsDay: 1, jobCpuS: 200000 },
  "file-sync": { dau: 1e7, rpu: 100, cpuMs: 5, respMs: 40, reads: 1, hit: 60, recDay: 5e8, recBytes: 300, years: 3, filesDay: 5e8, fileMB: 1, conns: 5e6 },
};

// technology fit: best = small bonus when chosen, poor = small penalty when chosen (explicit choices only)
const fit = {
  "web-app": [{ t: "sql", best: ["postgres", "mysql", "aurora"], why: "A single-region relational database is the simple, proven choice at this scale." }],
  "url-shortener": [{ t: "nosql", best: ["dynamodb", "cassandra", "scylla", "bigtable"], why: "Key-value lookups by code over billions of rows: a partitioned KV store fits perfectly." }],
  "rate-limiter": [{ t: "cache", best: ["redis"], poor: { memcached: "Memcached has no Lua scripts or sorted sets, so atomic sliding-window checks across gateways get hard." }, why: "Redis gives atomic INCR, TTLs and Lua scripts for race-free counters." }],
  "chat-system": [
    { t: "nosql", best: ["cassandra", "scylla", "bigtable", "dynamodb"], why: "Wide-column stores handle billions of appends a day, partitioned by conversation." },
    { t: "queue", best: ["kafka"], why: "Kafka keeps per-conversation order within a partition and can replay." },
  ],
  "news-feed": [
    { t: "cache", best: ["redis"], poor: { memcached: "Memcached has no list type, and timelines are capped lists of post IDs." }, why: "Redis lists hold each user's timeline of post IDs." },
    { t: "queue", best: ["kafka"], why: "A replayable log suits fan-out: workers can catch up after failures." },
  ],
  "video-streaming": [{ t: "queue", best: ["sqs", "rabbitmq", "pubsub", "kafka"], why: "Transcode jobs are independent tasks: any durable queue with retries works." }],
  "ride-sharing": [{ t: "sql", best: ["postgres", "spanner", "cockroach", "aurora"], why: "Rides need transactions; PostGIS, Spanner or CockroachDB also handle geo and scale." }],
  "web-crawler": [{ t: "queue", best: ["kafka"], why: "A durable, partitioned log makes a frontier that survives crashes and splits by host." }],
  "notification-system": [
    { t: "queue", best: ["sqs", "rabbitmq", "pubsub"], why: "Per-message acks, delays and dead-letter queues are exactly what sending needs." },
    { t: "nosql", best: ["cassandra", "scylla", "dynamodb"], why: "The notification log is write-heavy and time-ordered." },
  ],
  typeahead: [{ t: "queue", best: ["kafka"], why: "Search logs stream through Kafka into the aggregation job." }],
  "file-sync": [{ t: "sql", best: ["postgres", "mysql", "spanner", "cockroach", "aurora"], why: "Versioned commits need ACID transactions on the metadata." }],
};

for (const c of components) c.icon = icons[c.t];

for (const s of scenarios) {
  s.calc = { ...base, ...(calc[s.id] || {}) };
  s.fit = fit[s.id] || [];
}

// Where to learn more about each component (rating feedback and the model answer link here)
const learn = {
  client: ["The interview framework", "/topics/how-to-approach/"], dns: ["Networking basics", "/topics/networking/"],
  cdn: ["CDNs", "/topics/cdn/"], lb: ["Load balancing", "/topics/load-balancing/"], gateway: ["Rate limiting", "/topics/rate-limiting/"],
  ws: ["APIs & real-time", "/topics/apis/"], app: ["Scaling basics", "/topics/scaling/"], cache: ["Caching", "/topics/caching/"],
  sql: ["SQL vs NoSQL", "/topics/databases/"], replica: ["Replication", "/topics/replication/"], nosql: ["SQL vs NoSQL", "/topics/databases/"],
  blob: ["Blob storage", "/topics/object-storage/"], queue: ["Queues & streams", "/topics/message-queues/"], worker: ["Queues & streams", "/topics/message-queues/"],
  idgen: ["Unique IDs", "/topics/unique-ids/"], search: ["Indexes & storage engines", "/topics/indexing/"],
  geo: ["Ride sharing walkthrough", "/practice/ride-sharing/"], push: ["Notification system walkthrough", "/practice/notification-system/"],
};

// The best design is never free: what each key choice buys and costs, and how the design copes
// when things go wrong. [choice, what you gain, what you pay] and [event, what happens, how the design copes]
const depth = {
  "web-app": {
    tradeoffs: [
      ["Cache-aside in front of the database", "The app decides what to cache; a cache outage degrades speed, not correctness.", "Readers can see stale data until the key is deleted or expires, so every write must invalidate the key."],
      ["Asynchronous read replicas", "Cheap read capacity and a warm standby.", "Replication lag: a user can post a comment and not see it on refresh. Read a user's own recent writes from the primary for a few seconds."],
      ["One SQL primary", "Transactions, joins and simple operations.", "A write ceiling around 5k/s. Fine at 1M users; plan the shard key before you need it."],
    ],
    failures: [
      ["The primary dies", "Writes fail until a replica is promoted (about 30 s).", "Automatic failover. With async replication, the last fraction of a second of writes can be lost."],
      ["A cache node restarts empty", "Every key misses at once and the database gets a stampede.", "Request coalescing (one refill per key), jittered TTLs, and warming the cache before taking traffic."],
      ["A photo goes viral", "Millions of requests for one object.", "The CDN serves it; an origin shield turns thousands of edge misses into one origin request."],
      ["A bad deploy", "Errors spike across the stateless tier.", "Canary releases, health checks that pull bad servers, and instant rollback."],
    ],
  },
  "url-shortener": {
    tradeoffs: [
      ["301 vs 302 redirects", "301 is cached by browsers: less load.", "You lose click analytics. Use 302 if analytics matter."],
      ["Counter + base62 codes", "No collisions and no lookups to check uniqueness.", "Codes are guessable in order; shuffle the number (a bijective mix) before encoding."],
      ["Key-value store over SQL", "Scales to billions of rows by partitioning on the code.", "No joins or ad-hoc queries; analytics go to a separate store."],
    ],
    failures: [
      ["A link goes viral (hot key)", "One cache shard and one store partition take all the traffic.", "Replicate hot keys across cache nodes and add a small in-process cache on each server."],
      ["The ID generator is down", "New links can't be created.", "Each server leases a block of IDs in advance and keeps working through short outages."],
      ["A link is deleted for abuse", "Caches and browsers keep redirecting.", "Delete the cache key, purge the CDN, and prefer 302 for links you may need to kill."],
    ],
  },
  "rate-limiter": {
    tradeoffs: [
      ["Token bucket vs sliding window", "Token bucket allows short bursts and is cheap.", "Sliding windows are smoother and more exact but cost more memory or maths."],
      ["Central Redis counters", "One exact count across all gateways.", "An extra network hop (~1 ms) and a dependency that can fail."],
      ["Fail open vs fail closed", "Open keeps the API up if Redis dies.", "It also turns off protection. Close it for login and payment endpoints."],
    ],
    failures: [
      ["Redis is unreachable", "Limits can't be checked.", "Fail open for normal endpoints, closed for sensitive ones, with a local in-memory fallback limit."],
      ["One huge client (hot key)", "All its checks land on one Redis shard.", "A local pre-limiter per gateway, so only near-limit traffic consults Redis."],
      ["Multi-region traffic", "Per-region counters allow N× the limit globally.", "Accept it, split the limit across regions, or sync counters asynchronously."],
    ],
  },
  "chat-system": {
    tradeoffs: [
      ["Wide-column store for messages", "Billions of appends a day, partitioned by conversation, read in order.", "No joins or full-text search; search needs a separate index."],
      ["At-least-once delivery", "No message is lost when a connection drops.", "Duplicates on retry, so clients send a message ID and the server dedupes."],
      ["Push to each member on send (small groups)", "Instant delivery and simple reads.", "Huge groups multiply writes; very large channels switch to members pulling the latest messages."],
    ],
    failures: [
      ["Messages arrive out of order", "Two senders, client clocks that disagree, or a retry make messages race.", "The server assigns a per-conversation sequence number; clients sort by it and fetch any gap they detect."],
      ["Replication lag", "A message is written to one replica; the recipient's history read hits a replica that hasn't caught up, so the message seems missing.", "Write and read history at quorum (W + R > N), or read from the partition leader; tolerate lag only for counters like unread badges."],
      ["A hot partition during a viral event", "A live event's chat or a 100k-member group pins one partition, so one node melts while others idle.", "Partition by (conversation, time bucket), cap group size, and move very large rooms to a broadcast/fan-out tier."],
      ["A gateway crashes", "Its 50k connected users all reconnect at once (a reconnect storm).", "Jittered backoff, and resuming from each device's last sequence number instead of a full resync."],
    ],
  },
  "news-feed": {
    tradeoffs: [
      ["Fan-out on write", "A timeline load is one cache read.", "Write amplification: one post becomes a write per follower."],
      ["Hybrid for celebrities", "Avoids 100M writes per celebrity post.", "Reads get a merge step and more code paths to test."],
      ["Capped timelines in Redis (~800 IDs)", "Bounded memory per user.", "Deep scrolling falls back to slower queries."],
    ],
    failures: [
      ["A celebrity posts", "Fan-out workers fall behind for everyone.", "Skip fan-out above a follower threshold and merge their posts at read time."],
      ["The timeline cache cluster is lost", "Every load rebuilds from the database at once.", "Replicas for the cache, rebuild timelines lazily, and shed load for inactive users."],
      ["A post is deleted or a user is blocked", "Precomputed timelines still contain the ID.", "Filter at read time when hydrating posts."],
    ],
  },
  "video-streaming": {
    tradeoffs: [
      ["Transcode every rendition up front", "Fast starts and smooth quality switching.", "Storage for renditions nobody watches; transcode the long tail on demand."],
      ["2–6 s segments", "Quick adaptation to bandwidth changes.", "More requests and manifest overhead than longer segments."],
      ["Pull CDN with an origin shield", "Simple, and popular videos cache themselves.", "The first viewer in each region pays a miss; pre-warm for premieres."],
    ],
    failures: [
      ["A transcode worker crashes", "One chunk isn't encoded.", "Chunks are idempotent tasks on a queue and get retried."],
      ["A CDN region goes down", "Viewers in that region buffer.", "Multi-CDN with DNS steering to healthy edges."],
      ["A premiere starts (thundering herd)", "Millions of first requests miss together.", "Pre-warm edges, an origin shield, and collapsing identical requests."],
    ],
  },
  "ride-sharing": {
    tradeoffs: [
      ["Locations in memory, not a database", "250k updates a second at microsecond cost.", "Lost on a crash, but rebuilt from the next round of pings within seconds."],
      ["Geohash cells", "Simple, prefix-based and easy to shard.", "Edge effects: always search neighbouring cells too."],
      ["Strong consistency for assignment", "A driver can never get two rides.", "A conditional write on every assignment, and some unavailability during partitions."],
    ],
    failures: [
      ["Two riders match the same driver", "A race at the moment of assignment.", "Claim the driver with a conditional update (status = available) or a short lease."],
      ["A concert ends (hot cell)", "One city shard gets thousands of requests at once.", "Split dense cells, add replicas for that shard, and surge pricing to shape demand."],
      ["A driver's app goes offline", "A stale location keeps getting offered rides.", "Locations expire after a few missed pings."],
    ],
  },
  "web-crawler": {
    tradeoffs: [
      ["Bloom filter for seen URLs", "About 1 byte per URL.", "False positives: a few new URLs are wrongly skipped."],
      ["Priority over breadth-first", "Important pages are fresh.", "Low-priority pages may wait a long time."],
      ["Politeness per host", "Sites don't block you.", "Big sites take days to crawl at one request a second."],
    ],
    failures: [
      ["A crawler trap (infinite calendar)", "Endless URLs from one site.", "Depth, URL-length and per-host page budgets."],
      ["A crawler node dies", "Its hosts stop being crawled.", "Durable frontier partitions reassigned to other nodes."],
      ["Mirrors and duplicate pages", "Storage and work wasted.", "Content checksums and SimHash for near-duplicates."],
    ],
  },
  "notification-system": {
    tradeoffs: [
      ["At-least-once sending", "Nothing is silently dropped.", "Possible duplicates; idempotency keys and send records make them rare."],
      ["A queue per channel", "One slow provider can't stall the others.", "More queues and workers to operate."],
      ["Priority queues", "One-time codes never wait behind marketing.", "Low priority can starve; give it a guaranteed share."],
    ],
    failures: [
      ["A provider outage", "One channel stops delivering.", "A circuit breaker and a second provider per channel."],
      ["A worker crashes after sending", "The message is redelivered and sent twice.", "Check a send record keyed by (notification, channel) before sending."],
      ["A 50M-user campaign", "Queues flood and provider rate limits hit.", "Throttle to provider limits and spread sends over time."],
    ],
  },
  typeahead: {
    tradeoffs: [
      ["Precomputed top-k in a trie", "Lookups in microseconds.", "Memory-heavy and stale until the next rebuild."],
      ["Daily rebuild + a trending layer", "Cheap batch builds with fresh news.", "Two systems to merge and keep consistent."],
      ["Global suggestions, cached at the edge", "Huge cache hit rates.", "Personalisation breaks caching; merge per-user terms on the client."],
    ],
    failures: [
      ["An offensive suggestion appears", "Shown to millions immediately.", "A runtime blocklist applied before responding, no rebuild needed."],
      ["A bad snapshot is loaded", "Wrong suggestions everywhere.", "Validate snapshots and keep the previous one for instant rollback."],
      ["A hot prefix", "One trie shard overloaded.", "Edge caching and extra replicas for that shard."],
    ],
  },
  "file-sync": {
    tradeoffs: [
      ["Content-defined chunks", "Small edits upload little; identical chunks are stored once.", "More CPU on the client to find chunk boundaries."],
      ["Strongly consistent metadata (SQL)", "No corrupt or half-synced file trees.", "Harder to scale; shard by namespace."],
      ["Conflicted copies instead of merging", "Never loses anyone's work.", "Users sometimes have to reconcile two files by hand."],
    ],
    failures: [
      ["Two devices edit offline", "Both commit against the same version.", "The second commit gets a conflict and is saved as a conflicted copy."],
      ["An upload is interrupted", "A partial file.", "Nothing is committed until every chunk exists; uploads resume per chunk."],
      ["The notification service is down", "Devices don't hear about changes.", "Clients fall back to polling with backoff."],
    ],
  },
};

for (const s of scenarios) {
  Object.assign(s, depth[s.id] || {});
  const types = new Set();
  for (const r of [...(s.need || []), ...(s.min || [])]) r.t.split("|").forEach((x) => types.add(x));
  const seen = new Set();
  s.deeper = [...types].map((x) => learn[x]).filter((l) => l && !seen.has(l[1]) && seen.add(l[1]));
}

export default { components, scenarios, profiles, icons, learn };
