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

function walkthroughDiagram(slug) {
  const md = readFileSync(new URL(`../practice/${slug}.md`, import.meta.url), "utf8");
  const m = md.match(/{% diagram "([^"]*)" %}\n([\s\S]*?){% enddiagram %}/);
  return { caption: m[1], spec: m[2] };
}

const components = [
  { t: "client", label: "Client", kind: "client", hint: "Browser or mobile app making requests" },
  { t: "dns", label: "DNS", kind: "ext", hint: "Turns names into addresses; can steer traffic by region" },
  { t: "cdn", label: "CDN", kind: "cdn", hint: "Edge caches close to users for static and media files" },
  { t: "lb", label: "Load balancer", kind: "lb", hint: "Spreads requests across servers and skips dead ones" },
  { t: "gateway", label: "API gateway + rate limiter", kind: "lb", hint: "Front door: auth, routing and rate limits" },
  { t: "ws", label: "Realtime gateway", kind: "lb", hint: "Holds WebSocket / long-poll connections to push updates" },
  { t: "app", label: "App servers", kind: "service", hint: "Stateless services running your business logic" },
  { t: "cache", label: "Cache (Redis)", kind: "cache", hint: "In-memory key-value store for hot data and counters" },
  { t: "sql", label: "SQL database", kind: "db", hint: "Relational, ACID transactions, joins (Postgres, MySQL)" },
  { t: "replica", label: "Read replicas", kind: "db", hint: "Copies of the primary DB that serve reads" },
  { t: "nosql", label: "NoSQL / wide-column DB", kind: "db", hint: "Huge scale, simple access patterns (Cassandra, DynamoDB)" },
  { t: "blob", label: "Object storage", kind: "store", hint: "Cheap, durable storage for files and media (S3)" },
  { t: "queue", label: "Message queue", kind: "queue", hint: "Buffers work between services (Kafka, SQS)" },
  { t: "worker", label: "Workers", kind: "worker", hint: "Background jobs that consume from queues" },
  { t: "idgen", label: "ID generator", kind: "worker", hint: "Hands out unique IDs (Snowflake, ticket ranges)" },
  { t: "search", label: "Search index", kind: "db", hint: "Full-text and fuzzy search (Elasticsearch)" },
  { t: "geo", label: "Geo index (in memory)", kind: "cache", hint: "Answers 'what's near this point?' fast" },
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

export default { components, scenarios };
