// Animated "see it in action" demos, keyed by page slug (topic or practice file name, or "lab").
// Each demo has nodes (positions as fractions of the stage: `at` for wide screens, `n` for phones,
// defaulting to `at` rotated so left-to-right becomes top-to-bottom), links, four meters, and two
// scripted runs: good and bad. A run is a list of steps at times in ms:
//   say      caption            rate     requests per second (0 stops)
//   routes   [{ p, path, cls, back }]   which way requests go; cls colours them (hit, db, ok, error);
//            back: true sends them back red from the end of the path (a rejection)
//   queue    node id where requests pile up (then bounce back red when the pile is full)
//   dead / alive  node ids that crash / recover (requests reaching a dead node bounce back red)
//   load {id: %}, count {id: n}, label {id: text}, meters {key: [text, ok|warn|bad]}
//   fx [[id, over|under|spot, delayMs]], coins id, drain true, end true
// assets/js/demo.js plays them.

import icons from "./labIcons.js";

const M = {
  rps: ["rps", "Traffic"],
  p99: ["p99", "p99 latency"],
  err: ["err", "Errors"],
  cost: ["cost", "Cost / month"],
};
const STD = [M.rps, M.p99, M.err, M.cost];

function demo(d) {
  for (const n of d.nodes) {
    n.icon = icons[n.t] || "";
    if (!n.n) n.n = [n.at[1], n.at[0]];           // rotate for phones
  }
  d.meters = d.meters || STD;
  return d;
}

/* ---- Right-sized vs wrong-sized (the lab and the estimation page) ---------------------------- */
const sizing = demo({
  title: "See it in action: sizing",
  intro: "A photo-sharing app is about to hit its daily peak. Watch what the right sizing, and the wrong one, does to it.",
  nodes: [
    { id: "client", t: "client", kind: "client", label: "Users", at: [0.1, 0.5], n: [0.5, 0.09] },
    { id: "lb", t: "lb", kind: "lb", label: "Load balancer", at: [0.31, 0.5], n: [0.5, 0.32] },
    { id: "app", t: "app", kind: "service", label: "App servers", at: [0.53, 0.5], n: [0.36, 0.57], bar: "cpu" },
    { id: "cache", t: "cache", kind: "cache", label: "Cache", at: [0.8, 0.22], n: [0.25, 0.88] },
    { id: "db", t: "sql", kind: "db", label: "Database", at: [0.8, 0.78], n: [0.75, 0.88], bar: "load" },
  ],
  links: [["client", "lb"], ["lb", "app"], ["app", "cache"], ["app", "db"]],
  good: {
    label: "When it goes well",
    steps: [
      { at: 0, say: "Peak traffic: 1M users × 50 requests a day, ×3 at peak ≈ 1,700 requests a second.", count: { app: 9, lb: 2 }, load: { app: 20, db: 10 },
        meters: { rps: ["1.7k/s", "ok"], p99: ["80 ms", "ok"], err: ["0%", "ok"], cost: ["$1.8k", "ok"] }, rate: 5,
        routes: [{ p: 0.8, path: ["client", "lb", "app", "cache"], cls: "hit" }, { p: 0.2, path: ["client", "lb", "app", "db"], cls: "db" }] },
      { at: 2600, say: "The load balancer spreads requests over 9 app servers: 8 needed for 20 ms of CPU each, plus 1 spare. Each runs at about 60% CPU, with room for a spike.", load: { app: 60 }, rate: 9 },
      { at: 5600, say: "Requests that need data try the cache first (green). It answers 8 in 10, so only a trickle reaches the database (yellow), which stays calm.", load: { db: 35 }, meters: { p99: ["120 ms", "ok"] } },
      { at: 9000, say: "Right-sized: p99 latency 120 ms, 0% errors, about $1.8k a month. Every machine is earning its keep.", fx: [["lb", "spot", 0], ["app", "spot", 260], ["db", "spot", 520]] },
      { at: 13000, end: true },
    ],
  },
  bad: {
    label: "When it goes wrong",
    steps: [
      { at: 0, say: "Same app, same 1,700 requests a second at peak. But someone sized it at just 2 app servers.", count: { app: 2, lb: 2 }, load: { app: 70, db: 15 },
        meters: { rps: ["1.7k/s", "ok"], p99: ["150 ms", "ok"], err: ["0%", "ok"], cost: ["$400", "ok"] }, rate: 9,
        routes: [{ p: 0.8, path: ["client", "lb", "app", "cache"], cls: "hit" }, { p: 0.2, path: ["client", "lb", "app", "db"], cls: "db" }] },
      { at: 2200, say: "Each server now has 2× more work than it can do. CPU pins at 100% and requests start queueing (the pile by the servers).", queue: "app", load: { app: 100 }, meters: { p99: ["1.9 s", "warn"], err: ["8%", "warn"] } },
      { at: 5200, say: "Latency passes 4 seconds. Clients time out and retry, adding even more load. 503 errors (red) climb past 50%. Meltdown.", meters: { p99: ["4.3 s", "bad"], err: ["54%", "bad"] }, fx: [["app", "under", 0]] },
      { at: 8600, say: "Panic fix: buy 60 servers! The queue drains and errors stop…", queue: null, drain: true, count: { app: 60 }, load: { app: 7 }, meters: { p99: ["90 ms", "ok"], err: ["0%", "ok"], cost: ["$12k", "bad"] } },
      { at: 10800, say: "…but every server idles at 7% CPU. The bill is $12k a month instead of $1.8k: about $10k a month of wasted money. BOOM.", coins: "app", fx: [["app", "over", 0]] },
      { at: 15500, say: "Both are sizing mistakes. Estimate from the numbers instead: try “Guess, then reveal” in the Design Lab.", end: true },
    ],
  },
});

const demos = {
  lab: sizing,
  estimation: sizing,

  /* ---- Fundamentals ---------------------------------------------------------------------- */
  scaling: demo({
    title: "See it in action: scaling out vs one big server",
    intro: "Traffic is about to double. Watch a horizontally scaled tier absorb it, and a single big server hit its ceiling.",
    nodes: [
      { id: "users", t: "client", kind: "client", label: "Users", at: [0.1, 0.5] },
      { id: "lb", t: "lb", kind: "lb", label: "Load balancer", at: [0.36, 0.5] },
      { id: "app", t: "app", kind: "service", label: "App servers", at: [0.62, 0.5], bar: "cpu" },
      { id: "db", t: "sql", kind: "db", label: "Database", at: [0.87, 0.5], bar: "load" },
    ],
    links: [["users", "lb"], ["lb", "app"], ["app", "db"]],
    good: { label: "Scale out", steps: [
      { at: 0, say: "4 stateless app servers behind a load balancer, each at 55% CPU.", count: { app: 4 }, load: { app: 55, db: 30 }, rate: 6,
        meters: { rps: ["5k/s", "ok"], p99: ["90 ms", "ok"], err: ["0%", "ok"], cost: ["$2k", "ok"] }, routes: [{ p: 1, path: ["users", "lb", "app", "db"], cls: "ok" }] },
      { at: 3000, say: "A campaign doubles traffic. CPU climbs to 85% and the autoscaler notices.", rate: 11, load: { app: 85 }, meters: { rps: ["10k/s", "warn"], p99: ["160 ms", "warn"] } },
      { at: 6000, say: "It adds 4 more servers in a couple of minutes. Because they're stateless, the balancer just starts sending them traffic. CPU is back to 55%.", count: { app: 8 }, load: { app: 55, db: 50 }, meters: { rps: ["10k/s", "ok"], p99: ["95 ms", "ok"], cost: ["$4k", "ok"] } },
      { at: 9000, say: "Doubled traffic, no errors, and the bill grows only while the traffic does.", fx: [["app", "spot", 0], ["lb", "spot", 250]] },
      { at: 12500, end: true },
    ] },
    bad: { label: "One big server", steps: [
      { at: 0, say: "One big 64-vCPU server handles today's traffic at 70% CPU. Simple, until it isn't.", dead: ["lb"], label: { lb: "(no balancer)" }, count: { app: 1 }, load: { app: 70, db: 30 }, rate: 6,
        meters: { rps: ["5k/s", "ok"], p99: ["100 ms", "ok"], err: ["0%", "ok"], cost: ["$3k", "ok"] }, routes: [{ p: 1, path: ["users", "app", "db"], cls: "ok" }] },
      { at: 3000, say: "Traffic doubles. There's no bigger machine to buy: CPU pins at 100% and requests queue.", rate: 11, queue: "app", load: { app: 100 }, meters: { rps: ["10k/s", "warn"], p99: ["2.4 s", "bad"], err: ["20%", "bad"] } },
      { at: 6500, say: "Then it crashes. It was the single point of failure: every request fails until it reboots.", dead: ["app"], queue: null, drain: true, fx: [["app", "under", 0]], meters: { err: ["100%", "bad"], p99: ["—", "bad"] } },
      { at: 10500, say: "Vertical scaling has a ceiling and no redundancy. Stateless servers behind a load balancer have neither problem.", rate: 0, end: true },
    ] },
  }),

  "load-balancing": demo({
    title: "See it in action: health checks",
    intro: "Three servers share the traffic. Then one of them crashes.",
    nodes: [
      { id: "users", t: "client", kind: "client", label: "Users", at: [0.1, 0.5] },
      { id: "lb", t: "lb", kind: "lb", label: "Load balancer", at: [0.38, 0.5] },
      { id: "s1", t: "app", kind: "service", label: "Server 1", at: [0.72, 0.17], n: [0.2, 0.8], bar: "cpu" },
      { id: "s2", t: "app", kind: "service", label: "Server 2", at: [0.72, 0.5], n: [0.5, 0.8], bar: "cpu" },
      { id: "s3", t: "app", kind: "service", label: "Server 3", at: [0.72, 0.83], n: [0.8, 0.8], bar: "cpu" },
    ],
    links: [["users", "lb"], ["lb", "s1"], ["lb", "s2"], ["lb", "s3"]],
    good: { label: "With health checks", steps: [
      { at: 0, say: "The balancer sends each request to the least busy of three servers. All three sit at 50% CPU.", load: { s1: 50, s2: 50, s3: 50 }, rate: 9,
        meters: { rps: ["3k/s", "ok"], p99: ["80 ms", "ok"], err: ["0%", "ok"], cost: ["$900", "ok"] },
        routes: [{ p: 0.34, path: ["users", "lb", "s1"], cls: "ok" }, { p: 0.33, path: ["users", "lb", "s2"], cls: "ok" }, { p: 0.33, path: ["users", "lb", "s3"], cls: "ok" }] },
      { at: 3000, say: "Server 2 crashes. For a moment, requests sent to it fail.", dead: ["s2"], fx: [["s2", "under", 0]], meters: { err: ["4%", "warn"] } },
      { at: 5200, say: "Its health check fails twice in a row, so the balancer takes it out of rotation. Servers 1 and 3 pick up the load at 75% CPU.",
        routes: [{ p: 0.5, path: ["users", "lb", "s1"], cls: "ok" }, { p: 0.5, path: ["users", "lb", "s3"], cls: "ok" }], load: { s1: 75, s3: 75, s2: 0 }, meters: { err: ["0%", "ok"], p99: ["95 ms", "ok"] } },
      { at: 8400, say: "Users barely noticed. When Server 2 passes its checks again, it rejoins automatically.", fx: [["lb", "spot", 0]] },
      { at: 11500, end: true },
    ] },
    bad: { label: "Without health checks", steps: [
      { at: 0, say: "Same three servers, but the balancer just rotates through them blindly (round robin, no health checks).", load: { s1: 50, s2: 50, s3: 50 }, rate: 9,
        meters: { rps: ["3k/s", "ok"], p99: ["80 ms", "ok"], err: ["0%", "ok"], cost: ["$900", "ok"] },
        routes: [{ p: 0.34, path: ["users", "lb", "s1"], cls: "ok" }, { p: 0.33, path: ["users", "lb", "s2"], cls: "ok" }, { p: 0.33, path: ["users", "lb", "s3"], cls: "ok" }] },
      { at: 3000, say: "Server 2 crashes, and the balancer keeps sending it a third of all requests. They all fail (red).", dead: ["s2"], fx: [["s2", "under", 0]], meters: { err: ["33%", "bad"] } },
      { at: 6200, say: "Users retry, so Servers 1 and 3 get extra load on top. They creep toward 100% and start queueing too.", load: { s1: 98, s3: 98 }, queue: "s1", meters: { p99: ["1.6 s", "bad"], err: ["41%", "bad"] } },
      { at: 9800, say: "One dead server took down a third of the site, then dragged the rest with it. Health checks are what make a balancer worth having.", end: true },
    ] },
  }),

  caching: demo({
    title: "See it in action: cache hits vs a cold cache",
    intro: "A read-heavy app at peak. Watch the database with a warm cache in front of it, and without one.",
    nodes: [
      { id: "users", t: "client", kind: "client", label: "Users", at: [0.1, 0.5] },
      { id: "app", t: "app", kind: "service", label: "App servers", at: [0.38, 0.5], bar: "cpu" },
      { id: "cache", t: "cache", kind: "cache", label: "Cache (Redis)", at: [0.72, 0.2], n: [0.27, 0.82] },
      { id: "db", t: "sql", kind: "db", label: "Database", at: [0.72, 0.8], n: [0.73, 0.82], bar: "load" },
    ],
    links: [["users", "app"], ["app", "cache"], ["app", "db"]],
    good: { label: "Warm cache", steps: [
      { at: 0, say: "20k reads a second. The app checks Redis first (cache-aside).", load: { app: 50, db: 15 }, rate: 10,
        meters: { rps: ["20k/s", "ok"], p99: ["12 ms", "ok"], err: ["0%", "ok"], cost: ["$3k", "ok"] },
        routes: [{ p: 0.92, path: ["users", "app", "cache"], cls: "hit" }, { p: 0.08, path: ["users", "app", "db"], cls: "db" }] },
      { at: 3000, say: "92% are hits (green), answered from memory in about a millisecond. Only misses (yellow) reach the database.", meters: { p99: ["15 ms", "ok"] } },
      { at: 6000, say: "The database handles 1.6k reads a second instead of 20k, at 15% load. Each miss refills the cache for the next reader.", fx: [["cache", "spot", 0], ["db", "spot", 250]] },
      { at: 10000, end: true },
    ] },
    bad: { label: "Cold cache", steps: [
      { at: 0, say: "Same traffic. The cache was just restarted, so it's empty.", load: { app: 50, db: 15 }, rate: 10, dead: ["cache"], label: { cache: "Cache (empty)" },
        meters: { rps: ["20k/s", "ok"], p99: ["15 ms", "ok"], err: ["0%", "ok"], cost: ["$3k", "ok"] },
        routes: [{ p: 1, path: ["users", "app", "db"], cls: "db" }] },
      { at: 2000, say: "Every read misses and goes to the database: 20k reads a second instead of 1.6k. And when a hot key expires, thousands of requests miss at once (a stampede).", load: { db: 100 }, queue: "db", meters: { p99: ["1.2 s", "warn"], err: ["5%", "warn"] } },
      { at: 5400, say: "The database can't keep up. Queries queue, connections run out, and the app starts returning errors.", fx: [["db", "under", 0]], meters: { p99: ["3.8 s", "bad"], err: ["38%", "bad"] } },
      { at: 9200, say: "Fixes: warm the cache before sending traffic, let one request per key refill it (request coalescing), and jitter TTLs.", end: true },
    ] },
  }),

  cdn: demo({
    title: "See it in action: CDN edges vs the origin",
    intro: "A page with images and scripts goes viral worldwide.",
    nodes: [
      { id: "users", t: "client", kind: "client", label: "Users worldwide", at: [0.1, 0.5] },
      { id: "edge", t: "cdn", kind: "cdn", label: "CDN edge (nearby)", at: [0.45, 0.5] },
      { id: "origin", t: "app", kind: "service", label: "Origin server", at: [0.85, 0.5], bar: "load" },
    ],
    links: [["users", "edge"], ["edge", "origin"]],
    good: { label: "With a CDN", steps: [
      { at: 0, say: "Static files are cached at edges close to each user.", load: { origin: 10 }, rate: 11,
        meters: { rps: ["40k/s", "ok"], p99: ["35 ms", "ok"], err: ["0%", "ok"], cost: ["$800", "ok"] },
        routes: [{ p: 0.96, path: ["users", "edge"], cls: "hit" }, { p: 0.04, path: ["users", "edge", "origin"], cls: "db" }] },
      { at: 3200, say: "96% of requests are answered at the edge (green), a few milliseconds away. Only misses travel to the origin.", load: { origin: 12 } },
      { at: 6500, say: "The origin serves 1.6k requests a second instead of 40k, and users everywhere get fast pages.", fx: [["edge", "spot", 0], ["origin", "spot", 250]] },
      { at: 10000, end: true },
    ] },
    bad: { label: "Origin only", steps: [
      { at: 0, say: "No CDN: every user, on every continent, fetches every file from one origin.", dead: ["edge"], label: { edge: "(no CDN)" }, load: { origin: 60 }, rate: 11,
        meters: { rps: ["40k/s", "ok"], p99: ["250 ms", "warn"], err: ["0%", "ok"], cost: ["$6k", "warn"] },
        routes: [{ p: 1, path: ["users", "origin"], cls: "db" }] },
      { at: 3000, say: "Far-away users wait for round trips across oceans. Then the viral spike arrives and the origin's bandwidth is used up.", load: { origin: 100 }, queue: "origin", meters: { p99: ["1.8 s", "bad"], err: ["12%", "warn"] } },
      { at: 6500, say: "The origin melts down, and the bandwidth bill spikes too.", fx: [["origin", "under", 0]], coins: "origin", meters: { err: ["35%", "bad"], cost: ["$14k", "bad"] } },
      { at: 10000, end: true },
    ] },
  }),

  replication: demo({
    title: "See it in action: failover",
    intro: "Writes go to the primary; reads can use a replica. Then the primary's machine dies.",
    nodes: [
      { id: "app", t: "app", kind: "service", label: "App servers", at: [0.15, 0.5] },
      { id: "primary", t: "sql", kind: "db", label: "Primary", at: [0.62, 0.22], n: [0.27, 0.8], bar: "load" },
      { id: "replica", t: "replica", kind: "db", label: "Replica", at: [0.62, 0.78], n: [0.73, 0.8], bar: "load" },
    ],
    links: [["app", "primary"], ["app", "replica"], ["primary", "replica"]],
    good: { label: "With a replica", steps: [
      { at: 0, say: "Writes (yellow) go to the primary, which streams them to a replica. Reads (green) use the replica.", load: { primary: 45, replica: 40 }, rate: 9,
        meters: { rps: ["4k/s", "ok"], p99: ["20 ms", "ok"], err: ["0%", "ok"], cost: ["$1.2k", "ok"] },
        routes: [{ p: 0.4, path: ["app", "primary"], cls: "db" }, { p: 0.6, path: ["app", "replica"], cls: "hit" }] },
      { at: 3000, say: "The primary's machine dies. Writes fail for a few seconds.", dead: ["primary"], fx: [["primary", "under", 0]], meters: { err: ["6%", "warn"] } },
      { at: 5800, say: "The failure detector notices and promotes the replica. It's the new primary, and writes resume.", label: { replica: "New primary" }, load: { replica: 70 },
        routes: [{ p: 1, path: ["app", "replica"], cls: "db" }], meters: { err: ["0%", "ok"], p99: ["25 ms", "ok"] }, fx: [["replica", "spot", 0]] },
      { at: 9200, say: "About 30 seconds of disruption, no lost data if replication was synchronous (or seconds of it if async). A new replica is then rebuilt.", end: true },
    ] },
    bad: { label: "No replica", steps: [
      { at: 0, say: "One database does everything. There's no copy.", dead: ["replica"], label: { replica: "(no replica)" }, load: { primary: 70 }, rate: 9,
        meters: { rps: ["4k/s", "ok"], p99: ["25 ms", "ok"], err: ["0%", "ok"], cost: ["$600", "ok"] },
        routes: [{ p: 1, path: ["app", "primary"], cls: "db" }] },
      { at: 3000, say: "Its machine dies. Every read and write fails.", dead: ["primary"], fx: [["primary", "under", 0]], meters: { err: ["100%", "bad"], p99: ["—", "bad"] } },
      { at: 6200, say: "The only way back is restoring last night's backup: hours of downtime, and every write since the backup is lost.", meters: { cost: ["downtime", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  sharding: demo({
    title: "See it in action: a good vs a bad shard key",
    intro: "Writes are split across three shards. How they're split matters.",
    nodes: [
      { id: "app", t: "app", kind: "service", label: "App servers", at: [0.15, 0.5] },
      { id: "a", t: "sql", kind: "db", label: "Shard A", at: [0.68, 0.16], n: [0.2, 0.8], bar: "load" },
      { id: "b", t: "sql", kind: "db", label: "Shard B", at: [0.68, 0.5], n: [0.5, 0.8], bar: "load" },
      { id: "c", t: "sql", kind: "db", label: "Shard C", at: [0.68, 0.84], n: [0.8, 0.8], bar: "load" },
    ],
    links: [["app", "a"], ["app", "b"], ["app", "c"]],
    meters: [["rps", "Writes"], M.p99, M.err, ["hot", "Busiest shard"]],
    good: { label: "hash(user_id)", steps: [
      { at: 0, say: "The shard key is a hash of the user ID, so writes spread evenly.", load: { a: 40, b: 40, c: 40 }, rate: 10,
        meters: { rps: ["15k/s", "ok"], p99: ["15 ms", "ok"], err: ["0%", "ok"], hot: ["40%", "ok"] },
        routes: [{ p: 0.34, path: ["app", "a"], cls: "db" }, { p: 0.33, path: ["app", "b"], cls: "db" }, { p: 0.33, path: ["app", "c"], cls: "db" }] },
      { at: 3500, say: "Each shard takes a third of the load. Traffic can triple before anything needs to change.", fx: [["a", "spot", 0], ["b", "spot", 200], ["c", "spot", 400]] },
      { at: 8000, end: true },
    ] },
    bad: { label: "created_at range", steps: [
      { at: 0, say: "The shard key is the creation time: A holds last year, B last month, C this week.", load: { a: 2, b: 5, c: 60 }, rate: 10,
        meters: { rps: ["15k/s", "ok"], p99: ["20 ms", "ok"], err: ["0%", "ok"], hot: ["60%", "warn"] },
        routes: [{ p: 1, path: ["app", "c"], cls: "db" }] },
      { at: 2600, say: "Every new write has a recent timestamp, so all of them hit Shard C. A and B sit idle.", load: { c: 100 }, queue: "c", meters: { hot: ["100%", "bad"], p99: ["900 ms", "warn"] } },
      { at: 5800, say: "Shard C melts down while the others are 98% idle. Three databases, the write capacity of one.", fx: [["c", "under", 0]], meters: { err: ["25%", "bad"], p99: ["3 s", "bad"] } },
      { at: 9500, say: "Pick a key with high cardinality that spreads load, like a hashed user ID.", end: true },
    ] },
  }),

  "message-queues": demo({
    title: "See it in action: absorbing a spike",
    intro: "Black Friday: orders arrive 10× faster than normal for a few minutes.",
    nodes: [
      { id: "shop", t: "app", kind: "service", label: "Checkout service", at: [0.12, 0.5] },
      { id: "queue", t: "queue", kind: "queue", label: "Order queue", at: [0.45, 0.5] },
      { id: "workers", t: "worker", kind: "worker", label: "Order workers", at: [0.8, 0.5], bar: "cpu" },
    ],
    links: [["shop", "queue"], ["queue", "workers"]],
    meters: [["rps", "Orders"], ["depth", "Queue depth"], M.err, ["p99", "Checkout time"]],
    good: { label: "With a queue", steps: [
      { at: 0, say: "Checkout puts each order on a queue and replies \"order received\" at once. Workers process them at a steady pace.", load: { workers: 60 }, rate: 4,
        meters: { rps: ["500/s", "ok"], depth: ["0", "ok"], err: ["0%", "ok"], p99: ["80 ms", "ok"] }, routes: [{ p: 1, path: ["shop", "queue", "workers"], cls: "ok" }] },
      { at: 2500, say: "The spike hits: 5,000 orders a second. The queue absorbs the burst (the pile) while workers keep going at full, safe speed.", rate: 14, queue: "queue", load: { workers: 90 }, meters: { rps: ["5k/s", "warn"], depth: ["180k", "warn"] } },
      { at: 6500, say: "Customers still get an instant reply; their order confirmation email arrives a few minutes later. Nothing fails.", rate: 4, meters: { rps: ["500/s", "ok"], p99: ["80 ms", "ok"] } },
      { at: 8500, say: "After the spike, workers drain the backlog. The queue turned a crash into a short delay.", queue: null, drain: true, load: { workers: 60 }, meters: { depth: ["0", "ok"] }, fx: [["queue", "spot", 0], ["workers", "spot", 250]] },
      { at: 12500, end: true },
    ] },
    bad: { label: "Synchronous calls", steps: [
      { at: 0, say: "No queue: checkout calls the order service directly and waits for it to finish.", dead: ["queue"], label: { queue: "(no queue)" }, load: { workers: 60 }, rate: 4,
        meters: { rps: ["500/s", "ok"], depth: ["—", "ok"], err: ["0%", "ok"], p99: ["400 ms", "ok"] }, routes: [{ p: 1, path: ["shop", "workers"], cls: "ok" }] },
      { at: 2500, say: "The spike hits. The order service can't go 10× faster, so calls pile up and checkout pages hang.", rate: 14, queue: "workers", load: { workers: 100 }, meters: { rps: ["5k/s", "warn"], p99: ["8 s", "bad"] } },
      { at: 6000, say: "Calls time out. Customers see errors and lose their carts on the busiest day of the year.", fx: [["workers", "under", 0]], meters: { err: ["47%", "bad"] } },
      { at: 9800, end: true },
    ] },
  }),

  "rate-limiting": demo({
    title: "See it in action: stopping a scraper",
    intro: "Normal users share the API with a bot that sends 50× more requests.",
    nodes: [
      { id: "users", t: "client", kind: "client", label: "Normal users", at: [0.1, 0.22], n: [0.27, 0.1] },
      { id: "bot", t: "client", kind: "ext", label: "Scraper bot", at: [0.1, 0.78], n: [0.73, 0.1] },
      { id: "gw", t: "gateway", kind: "lb", label: "API gateway", at: [0.45, 0.5], n: [0.5, 0.45] },
      { id: "api", t: "app", kind: "service", label: "API servers", at: [0.82, 0.5], n: [0.5, 0.85], bar: "cpu" },
    ],
    links: [["users", "gw"], ["bot", "gw"], ["gw", "api"]],
    good: { label: "With a rate limiter", steps: [
      { at: 0, say: "Each API key may make 100 requests a minute. The gateway counts them (token bucket in Redis).", load: { api: 40 }, rate: 9,
        meters: { rps: ["2k/s", "ok"], p99: ["60 ms", "ok"], err: ["0%", "ok"], cost: ["$1k", "ok"] },
        routes: [{ p: 0.45, path: ["users", "gw", "api"], cls: "ok" }, { p: 0.55, path: ["bot", "gw"], cls: "error", back: true }] },
      { at: 3000, say: "The bot blows through its limit, so the gateway answers it with 429 Too Many Requests (red) without touching the API.", meters: { err: ["0% for users", "ok"] } },
      { at: 6200, say: "Normal users don't notice a thing: the API stays at 40% CPU.", fx: [["gw", "spot", 0], ["api", "spot", 250]] },
      { at: 10000, end: true },
    ] },
    bad: { label: "No rate limiter", steps: [
      { at: 0, say: "No limits: every request from everyone goes straight through.", label: { gw: "API gateway (no limits)" }, load: { api: 50 }, rate: 10,
        meters: { rps: ["2k/s", "ok"], p99: ["60 ms", "ok"], err: ["0%", "ok"], cost: ["$1k", "ok"] },
        routes: [{ p: 0.3, path: ["users", "gw", "api"], cls: "ok" }, { p: 0.7, path: ["bot", "gw", "api"], cls: "db" }] },
      { at: 2500, say: "The bot's flood takes most of the API's capacity. CPU pins and requests queue.", queue: "api", load: { api: 100 }, meters: { rps: ["40k/s", "bad"], p99: ["2.5 s", "bad"] } },
      { at: 5800, say: "Real users' requests time out alongside the bot's. One client took the service down for everyone.", fx: [["api", "under", 0]], meters: { err: ["45%", "bad"], cost: ["$6k", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  reliability: demo({
    title: "See it in action: timeouts and circuit breakers",
    intro: "The checkout calls a payment provider. Today the provider is having a bad day.",
    nodes: [
      { id: "users", t: "client", kind: "client", label: "Users", at: [0.1, 0.5] },
      { id: "app", t: "app", kind: "service", label: "Checkout service", at: [0.45, 0.5], bar: "cpu" },
      { id: "pay", t: "push", kind: "ext", label: "Payment provider", at: [0.83, 0.5] },
    ],
    links: [["users", "app"], ["app", "pay"]],
    good: { label: "Timeouts + breaker", steps: [
      { at: 0, say: "Every call to the provider has a 2-second timeout, and a circuit breaker watches the failures.", load: { app: 40 }, rate: 8,
        meters: { rps: ["1k/s", "ok"], p99: ["300 ms", "ok"], err: ["0%", "ok"], cost: ["—", "ok"] }, routes: [{ p: 1, path: ["users", "app", "pay"], cls: "ok" }] },
      { at: 2800, say: "The provider slows down and starts failing. Calls time out after 2 s instead of hanging.", dead: ["pay"], meters: { p99: ["2 s", "warn"], err: ["10%", "warn"] } },
      { at: 5600, say: "Failures pass the threshold, so the breaker opens: calls fail fast and orders are queued to charge later. Checkout stays up.",
        routes: [{ p: 1, path: ["users", "app"], cls: "hit" }], meters: { p99: ["120 ms", "ok"], err: ["0%", "ok"] }, fx: [["app", "spot", 0]] },
      { at: 9000, say: "Every 30 s a trial call checks (half-open). When the provider recovers, the breaker closes and the queued charges go through.", alive: ["pay"] },
      { at: 12500, end: true },
    ] },
    bad: { label: "No timeouts", steps: [
      { at: 0, say: "Calls to the provider have no timeout: the service waits as long as it takes.", load: { app: 40 }, rate: 8,
        meters: { rps: ["1k/s", "ok"], p99: ["300 ms", "ok"], err: ["0%", "ok"], cost: ["—", "ok"] }, routes: [{ p: 1, path: ["users", "app", "pay"], cls: "ok" }] },
      { at: 2800, say: "The provider slows to 60 seconds per call. Every request now holds a thread while it waits (the pile).", queue: "app", load: { app: 100 }, meters: { p99: ["30 s", "bad"], err: ["5%", "warn"] } },
      { at: 6000, say: "All threads are stuck waiting, so even pages that never call the provider stop loading. One slow dependency took the whole service down.", fx: [["app", "under", 0]], meters: { err: ["70%", "bad"] } },
      { at: 9800, end: true },
    ] },
  }),

  /* ---- Practice questions --------------------------------------------------------------------- */
  "url-shortener": demo({
    title: "See it in action: a link goes viral",
    intro: "One short link is shared by a celebrity. Millions of people click it in an hour.",
    nodes: [
      { id: "users", t: "client", kind: "client", label: "Clickers", at: [0.1, 0.5] },
      { id: "app", t: "app", kind: "service", label: "Redirect service", at: [0.4, 0.5], bar: "cpu" },
      { id: "cache", t: "cache", kind: "cache", label: "Cache", at: [0.75, 0.2], n: [0.27, 0.82] },
      { id: "db", t: "nosql", kind: "db", label: "URL store", at: [0.75, 0.8], n: [0.73, 0.82], bar: "load" },
    ],
    links: [["users", "app"], ["app", "cache"], ["app", "db"]],
    good: { label: "Cached redirects", steps: [
      { at: 0, say: "The first click misses and loads the URL from the store; every click after that is a cache hit.", load: { app: 45, db: 8 }, rate: 11,
        meters: { rps: ["30k/s", "ok"], p99: ["8 ms", "ok"], err: ["0%", "ok"], cost: ["$1.5k", "ok"] },
        routes: [{ p: 0.97, path: ["users", "app", "cache"], cls: "hit" }, { p: 0.03, path: ["users", "app", "db"], cls: "db" }] },
      { at: 4000, say: "97% of redirects come from memory. The store barely notices the most popular link of the day.", fx: [["cache", "spot", 0], ["db", "spot", 250]] },
      { at: 8500, end: true },
    ] },
    bad: { label: "No cache", steps: [
      { at: 0, say: "No cache: every click looks the code up in the store.", dead: ["cache"], label: { cache: "(no cache)" }, load: { app: 45, db: 40 }, rate: 11,
        meters: { rps: ["30k/s", "ok"], p99: ["20 ms", "ok"], err: ["0%", "ok"], cost: ["$1.5k", "ok"] }, routes: [{ p: 1, path: ["users", "app", "db"], cls: "db" }] },
      { at: 2600, say: "It's one key, so it lives on one partition: a hot key. That partition hits its limit while the others idle.", load: { db: 100 }, queue: "db", meters: { p99: ["1.4 s", "bad"], err: ["10%", "warn"] } },
      { at: 5800, say: "Redirects slow down and fail for exactly the link everyone is clicking.", fx: [["db", "under", 0]], meters: { err: ["40%", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  "rate-limiter": demo({
    title: "See it in action: where the counters live",
    intro: "A bot hammers the API while dozens of gateways check every request against the limit.",
    nodes: [
      { id: "users", t: "client", kind: "client", label: "Users", at: [0.1, 0.22], n: [0.27, 0.08] },
      { id: "bot", t: "client", kind: "ext", label: "Bot", at: [0.1, 0.78], n: [0.73, 0.08] },
      { id: "gw", t: "gateway", kind: "lb", label: "Gateways", at: [0.42, 0.5], n: [0.5, 0.4] },
      { id: "store", t: "cache", kind: "cache", label: "Redis counters", at: [0.78, 0.2], n: [0.27, 0.82], bar: "load" },
      { id: "api", t: "app", kind: "service", label: "API", at: [0.78, 0.8], n: [0.73, 0.82], bar: "cpu" },
    ],
    links: [["users", "gw"], ["bot", "gw"], ["gw", "store"], ["gw", "api"]],
    good: { label: "Counters in Redis", steps: [
      { at: 0, say: "Each gateway checks and increments the key's counter in Redis with one atomic Lua call: under a millisecond.", load: { store: 30, api: 40 }, rate: 10,
        meters: { rps: ["20k/s", "ok"], p99: ["+1 ms", "ok"], err: ["0% for users", "ok"], cost: ["$800", "ok"] },
        routes: [{ p: 0.4, path: ["users", "gw", "api"], cls: "ok" }, { p: 0.4, path: ["bot", "gw"], cls: "error", back: true }, { p: 0.2, path: ["users", "gw", "store"], cls: "hit" }] },
      { at: 4000, say: "Over-limit bot requests get 429 (red) at the gateway. Users and the API are untouched.", fx: [["gw", "spot", 0], ["store", "spot", 250]] },
      { at: 8500, end: true },
    ] },
    bad: { label: "Counters in SQL", steps: [
      { at: 0, say: "The counters are rows in a SQL database: a read and an update on every single request.", label: { store: "SQL counters" }, load: { store: 50, api: 40 }, rate: 10,
        meters: { rps: ["20k/s", "ok"], p99: ["+15 ms", "warn"], err: ["0%", "ok"], cost: ["$800", "ok"] },
        routes: [{ p: 0.5, path: ["users", "gw", "store"], cls: "db" }, { p: 0.5, path: ["bot", "gw", "store"], cls: "db" }] },
      { at: 2600, say: "The bot's flood turns into a flood of database writes on the same hot rows. Locks pile up.", queue: "store", load: { store: 100 }, meters: { p99: ["+900 ms", "bad"] } },
      { at: 5800, say: "The limiter itself becomes the outage: every API call waits on it, users included.", fx: [["store", "under", 0]], meters: { err: ["30%", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  "chat-system": demo({
    title: "See it in action: storing 2 billion messages a day",
    intro: "Every message is saved before it's delivered. Where it's saved matters.",
    nodes: [
      { id: "alice", t: "client", kind: "client", label: "Senders", at: [0.08, 0.5] },
      { id: "gw", t: "ws", kind: "lb", label: "Realtime gateways", at: [0.33, 0.5] },
      { id: "chat", t: "app", kind: "service", label: "Chat service", at: [0.58, 0.5], bar: "cpu" },
      { id: "store", t: "nosql", kind: "db", label: "Cassandra", at: [0.86, 0.2], n: [0.27, 0.88], bar: "load" },
      { id: "bob", t: "client", kind: "client", label: "Recipients", at: [0.86, 0.8], n: [0.73, 0.88] },
    ],
    links: [["alice", "gw"], ["gw", "chat"], ["chat", "store"], ["chat", "bob"]],
    good: { label: "Wide-column store", steps: [
      { at: 0, say: "Each message is written to Cassandra (yellow), partitioned by conversation, then pushed to the recipient (green).", load: { chat: 50, store: 45 }, rate: 10,
        meters: { rps: ["70k msg/s", "ok"], p99: ["90 ms", "ok"], err: ["0%", "ok"], cost: ["$40k", "ok"] },
        routes: [{ p: 0.5, path: ["alice", "gw", "chat", "store"], cls: "db" }, { p: 0.5, path: ["alice", "gw", "chat", "bob"], cls: "hit" }] },
      { at: 4000, say: "Writes spread over hundreds of nodes; adding nodes adds write capacity. Delivery stays under 100 ms.", fx: [["store", "spot", 0], ["chat", "spot", 250]] },
      { at: 8500, end: true },
    ] },
    bad: { label: "One SQL database", steps: [
      { at: 0, say: "All messages go into one SQL database.", label: { store: "One SQL database" }, load: { chat: 50, store: 70 }, rate: 10,
        meters: { rps: ["70k msg/s", "ok"], p99: ["120 ms", "ok"], err: ["0%", "ok"], cost: ["$5k", "ok"] },
        routes: [{ p: 0.5, path: ["alice", "gw", "chat", "store"], cls: "db" }, { p: 0.5, path: ["alice", "gw", "chat", "bob"], cls: "hit" }] },
      { at: 2600, say: "70k writes a second is 10× what one primary can take. Writes queue, and messages aren't acknowledged.", queue: "store", load: { store: 100 }, meters: { p99: ["4 s", "bad"] } },
      { at: 5800, say: "Senders see \"sending…\" forever and retry, adding more load. The database melts down.", fx: [["store", "under", 0]], meters: { err: ["35%", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  "news-feed": demo({
    title: "See it in action: loading timelines",
    intro: "200 million people open the app and load their home timeline.",
    nodes: [
      { id: "users", t: "client", kind: "client", label: "Readers", at: [0.1, 0.5] },
      { id: "app", t: "app", kind: "service", label: "Timeline service", at: [0.4, 0.5], bar: "cpu" },
      { id: "cache", t: "cache", kind: "cache", label: "Timeline cache", at: [0.76, 0.2], n: [0.27, 0.82] },
      { id: "db", t: "nosql", kind: "db", label: "Posts store", at: [0.76, 0.8], n: [0.73, 0.82], bar: "load" },
    ],
    links: [["users", "app"], ["app", "cache"], ["app", "db"]],
    good: { label: "Fan-out on write", steps: [
      { at: 0, say: "Timelines are precomputed: each user's list of post IDs is waiting in Redis.", load: { app: 50, db: 25 }, rate: 11,
        meters: { rps: ["150k/s", "ok"], p99: ["60 ms", "ok"], err: ["0%", "ok"], cost: ["$60k", "ok"] },
        routes: [{ p: 0.85, path: ["users", "app", "cache"], cls: "hit" }, { p: 0.15, path: ["users", "app", "db"], cls: "db" }] },
      { at: 4000, say: "A timeline load is one cache read plus one batch lookup of the posts. Fast, and cheap for the store.", fx: [["cache", "spot", 0], ["db", "spot", 250]] },
      { at: 8500, end: true },
    ] },
    bad: { label: "Fan-out on read", steps: [
      { at: 0, say: "No precomputed timelines: each load queries the latest posts of all 300 accounts you follow, then merges them.", dead: ["cache"], label: { cache: "(none)" }, load: { app: 70, db: 60 }, rate: 11,
        meters: { rps: ["150k/s", "ok"], p99: ["300 ms", "warn"], err: ["0%", "ok"], cost: ["$60k", "ok"] },
        routes: [{ p: 1, path: ["users", "app", "db"], cls: "db" }] },
      { at: 2600, say: "That's 300 queries per timeline: 45 million queries a second at peak. The store is crushed.", queue: "db", load: { db: 100, app: 100 }, meters: { p99: ["5 s", "bad"] } },
      { at: 5800, say: "Timelines spin forever. Fan-out on read only works for the few huge accounts (that's the hybrid).", fx: [["db", "under", 0]], meters: { err: ["50%", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  "video-streaming": demo({
    title: "See it in action: serving video",
    intro: "A premiere starts and 5 million people press play at once.",
    nodes: [
      { id: "viewers", t: "client", kind: "client", label: "Viewers", at: [0.1, 0.5] },
      { id: "cdn", t: "cdn", kind: "cdn", label: "CDN edges", at: [0.45, 0.5] },
      { id: "origin", t: "blob", kind: "store", label: "Origin storage", at: [0.85, 0.5], bar: "load" },
    ],
    links: [["viewers", "cdn"], ["cdn", "origin"]],
    meters: [["rps", "Egress"], ["p99", "Start time"], ["err", "Rebuffering"], M.cost],
    good: { label: "From the CDN", steps: [
      { at: 0, say: "Video segments are cached at edges near viewers, pre-warmed before the premiere.", load: { origin: 8 }, rate: 12,
        meters: { rps: ["25 Tbps", "ok"], p99: ["1.1 s", "ok"], err: ["0.2%", "ok"], cost: ["$$", "ok"] },
        routes: [{ p: 0.98, path: ["viewers", "cdn"], cls: "hit" }, { p: 0.02, path: ["viewers", "cdn", "origin"], cls: "db" }] },
      { at: 4000, say: "98% of bytes come from the edge (green). The origin only fills the occasional miss.", fx: [["cdn", "spot", 0], ["origin", "spot", 250]] },
      { at: 8500, end: true },
    ] },
    bad: { label: "From the origin", steps: [
      { at: 0, say: "No CDN: every viewer streams every segment from your origin.", dead: ["cdn"], label: { cdn: "(no CDN)" }, load: { origin: 70 }, rate: 12,
        meters: { rps: ["25 Tbps", "warn"], p99: ["3 s", "warn"], err: ["2%", "warn"], cost: ["$$$", "warn"] },
        routes: [{ p: 1, path: ["viewers", "origin"], cls: "db" }] },
      { at: 2600, say: "25 terabits a second is far beyond any single origin's network. Requests queue.", queue: "origin", load: { origin: 100 }, meters: { p99: ["20 s", "bad"], err: ["60%", "bad"] } },
      { at: 5800, say: "Streams freeze, and the egress bill for those bytes is enormous. Video has to come from edges.", fx: [["origin", "under", 0]], coins: "origin", meters: { cost: ["$$$$$", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  "ride-sharing": demo({
    title: "See it in action: 250k location updates a second",
    intro: "Every driver's app reports its location every 4 seconds.",
    nodes: [
      { id: "drivers", t: "client", kind: "client", label: "Drivers", at: [0.08, 0.5] },
      { id: "gw", t: "ws", kind: "lb", label: "Gateway", at: [0.32, 0.5] },
      { id: "loc", t: "app", kind: "service", label: "Location service", at: [0.57, 0.5], bar: "cpu" },
      { id: "geo", t: "geo", kind: "cache", label: "Geo index (memory)", at: [0.86, 0.2], n: [0.27, 0.88] },
      { id: "db", t: "sql", kind: "db", label: "Rides DB", at: [0.86, 0.8], n: [0.73, 0.88], bar: "load" },
    ],
    links: [["drivers", "gw"], ["gw", "loc"], ["loc", "geo"], ["loc", "db"]],
    good: { label: "In-memory geo index", steps: [
      { at: 0, say: "Locations go to an in-memory geo index, sharded by city (green). Only ride changes go to SQL (yellow).", load: { loc: 55, db: 20 }, rate: 12,
        meters: { rps: ["250k/s", "ok"], p99: ["15 ms", "ok"], err: ["0%", "ok"], cost: ["$20k", "ok"] },
        routes: [{ p: 0.95, path: ["drivers", "gw", "loc", "geo"], cls: "hit" }, { p: 0.05, path: ["drivers", "gw", "loc", "db"], cls: "db" }] },
      { at: 4000, say: "Overwriting a location in memory is microseconds, and \"nearest drivers\" is a fast cell lookup.", fx: [["geo", "spot", 0], ["db", "spot", 250]] },
      { at: 8500, end: true },
    ] },
    bad: { label: "Locations in SQL", steps: [
      { at: 0, say: "Every location update is an UPDATE on a SQL table.", dead: ["geo"], label: { geo: "(no geo index)" }, load: { loc: 55, db: 70 }, rate: 12,
        meters: { rps: ["250k/s", "ok"], p99: ["40 ms", "ok"], err: ["0%", "ok"], cost: ["$20k", "ok"] },
        routes: [{ p: 1, path: ["drivers", "gw", "loc", "db"], cls: "db" }] },
      { at: 2600, say: "250k writes a second is 50× what one primary handles, for data that's stale in 4 seconds anyway.", queue: "db", load: { db: 100 }, meters: { p99: ["6 s", "bad"] } },
      { at: 5800, say: "The database melts down, and with it ride booking, because that's in the same database.", fx: [["db", "under", 0]], meters: { err: ["55%", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  "web-crawler": demo({
    title: "See it in action: politeness",
    intro: "Thousands of URLs from one site sit in the frontier.",
    nodes: [
      { id: "frontier", t: "queue", kind: "queue", label: "URL frontier", at: [0.1, 0.5] },
      { id: "fetch", t: "worker", kind: "worker", label: "Fetchers", at: [0.42, 0.5] },
      { id: "a", t: "app", kind: "ext", label: "big-site.com", at: [0.8, 0.16], n: [0.2, 0.85], bar: "load" },
      { id: "b", t: "app", kind: "ext", label: "blog.org", at: [0.8, 0.5], n: [0.5, 0.85], bar: "load" },
      { id: "c", t: "app", kind: "ext", label: "news.net", at: [0.8, 0.84], n: [0.8, 0.85], bar: "load" },
    ],
    links: [["frontier", "fetch"], ["fetch", "a"], ["fetch", "b"], ["fetch", "c"]],
    meters: [["rps", "Pages/s"], ["p99", "Fetch time"], ["err", "Blocked"], ["cost", "Sites angry"]],
    good: { label: "Per-host queues", steps: [
      { at: 0, say: "The frontier keeps one queue per host and allows about one request a second to each site.", load: { a: 15, b: 10, c: 10 }, rate: 9,
        meters: { rps: ["400/s", "ok"], p99: ["300 ms", "ok"], err: ["0%", "ok"], cost: ["0", "ok"] },
        routes: [{ p: 0.34, path: ["frontier", "fetch", "a"], cls: "ok" }, { p: 0.33, path: ["frontier", "fetch", "b"], cls: "ok" }, { p: 0.33, path: ["frontier", "fetch", "c"], cls: "ok" }] },
      { at: 4000, say: "Fetchers stay busy across many hosts, and no site sees more than a trickle.", fx: [["a", "spot", 0], ["b", "spot", 200], ["c", "spot", 400]] },
      { at: 8500, end: true },
    ] },
    bad: { label: "No politeness", steps: [
      { at: 0, say: "No per-host limits: fetchers grab URLs as fast as they come, and most of them are big-site.com.", load: { a: 60, b: 5, c: 5 }, rate: 11,
        meters: { rps: ["400/s", "ok"], p99: ["300 ms", "ok"], err: ["0%", "ok"], cost: ["0", "ok"] },
        routes: [{ p: 0.9, path: ["frontier", "fetch", "a"], cls: "ok" }, { p: 0.05, path: ["frontier", "fetch", "b"], cls: "ok" }, { p: 0.05, path: ["frontier", "fetch", "c"], cls: "ok" }] },
      { at: 2600, say: "big-site.com gets hundreds of requests a second from one crawler. Its servers struggle.", queue: "a", load: { a: 100 }, meters: { p99: ["5 s", "bad"], cost: ["1", "warn"] } },
      { at: 5600, say: "It blocks your crawler's IPs (red 403s) and you lose the whole site. Politeness isn't optional.", fx: [["a", "under", 0]], queue: null, drain: true,
        routes: [{ p: 0.9, path: ["frontier", "fetch", "a"], cls: "error", back: true }, { p: 0.1, path: ["frontier", "fetch", "b"], cls: "ok" }], meters: { err: ["90%", "bad"], cost: ["1", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  "notification-system": demo({
    title: "See it in action: one slow provider",
    intro: "The SMS provider is having a slow day. Push and email are fine.",
    nodes: [
      { id: "api", t: "app", kind: "service", label: "Notification API", at: [0.1, 0.5] },
      { id: "qp", t: "queue", kind: "queue", label: "Push queue", at: [0.42, 0.2], n: [0.27, 0.42] },
      { id: "qs", t: "queue", kind: "queue", label: "SMS queue", at: [0.42, 0.8], n: [0.73, 0.42] },
      { id: "push", t: "push", kind: "ext", label: "APNs / FCM", at: [0.82, 0.2], n: [0.27, 0.85] },
      { id: "sms", t: "push", kind: "ext", label: "SMS provider", at: [0.82, 0.8], n: [0.73, 0.85] },
    ],
    links: [["api", "qp"], ["api", "qs"], ["qp", "push"], ["qs", "sms"]],
    meters: [["rps", "Sends"], ["p99", "Push delay"], ["err", "Dropped"], ["cost", "SMS backlog"]],
    good: { label: "A queue per channel", steps: [
      { at: 0, say: "Each channel has its own queue and workers.", rate: 10,
        meters: { rps: ["2k/s", "ok"], p99: ["1 s", "ok"], err: ["0", "ok"], cost: ["0", "ok"] },
        routes: [{ p: 0.6, path: ["api", "qp", "push"], cls: "ok" }, { p: 0.4, path: ["api", "qs", "sms"], cls: "ok" }] },
      { at: 2600, say: "SMS slows to a crawl. SMS messages wait in their own queue (the pile)…", queue: "qs", meters: { cost: ["40k", "warn"] } },
      { at: 5600, say: "…while push notifications keep flowing in about a second. One slow provider affects one channel.", fx: [["qp", "spot", 0], ["push", "spot", 250]] },
      { at: 9000, say: "When SMS recovers, its workers drain the backlog with retries. Nothing is lost.", queue: null, drain: true, meters: { cost: ["0", "ok"] } },
      { at: 12000, end: true },
    ] },
    bad: { label: "One shared queue", steps: [
      { at: 0, say: "Everything shares one queue and one pool of workers.", dead: ["qs"], label: { qp: "Shared queue", qs: "(none)" }, rate: 10,
        meters: { rps: ["2k/s", "ok"], p99: ["1 s", "ok"], err: ["0", "ok"], cost: ["0", "ok"] },
        routes: [{ p: 0.6, path: ["api", "qp", "push"], cls: "ok" }, { p: 0.4, path: ["api", "qp", "sms"], cls: "ok" }] },
      { at: 2600, say: "SMS slows down. Workers get stuck waiting on SMS calls, and the shared queue backs up.", queue: "qp", meters: { p99: ["12 min", "bad"], cost: ["40k", "bad"] } },
      { at: 5800, say: "Push notifications and login codes now wait behind slow SMS messages. One provider stalled every channel.", fx: [["qp", "under", 0]], meters: { err: ["8%", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  typeahead: demo({
    title: "See it in action: a request per keystroke",
    intro: "Every keystroke in the search box asks for suggestions: 150k requests a second at peak.",
    nodes: [
      { id: "users", t: "client", kind: "client", label: "Typing users", at: [0.08, 0.5] },
      { id: "cdn", t: "cdn", kind: "cdn", label: "CDN edge", at: [0.32, 0.5] },
      { id: "svc", t: "app", kind: "service", label: "Suggest service", at: [0.57, 0.5], bar: "cpu" },
      { id: "trie", t: "cache", kind: "cache", label: "In-memory trie", at: [0.86, 0.2], n: [0.27, 0.88] },
      { id: "db", t: "sql", kind: "db", label: "SQL database", at: [0.86, 0.8], n: [0.73, 0.88], bar: "load" },
    ],
    links: [["users", "cdn"], ["cdn", "svc"], ["svc", "trie"], ["svc", "db"]],
    good: { label: "Trie + edge cache", steps: [
      { at: 0, say: "Short popular prefixes are answered by the CDN; the rest hit an in-memory trie with the top 10 precomputed.", load: { svc: 45, db: 0 }, rate: 12,
        meters: { rps: ["150k/s", "ok"], p99: ["25 ms", "ok"], err: ["0%", "ok"], cost: ["$8k", "ok"] },
        routes: [{ p: 0.5, path: ["users", "cdn"], cls: "hit" }, { p: 0.5, path: ["users", "cdn", "svc", "trie"], cls: "hit" }] },
      { at: 4000, say: "Each lookup is a short walk down the trie: microseconds. Suggestions appear between keystrokes.", fx: [["trie", "spot", 0], ["cdn", "spot", 250]] },
      { at: 8500, end: true },
    ] },
    bad: { label: "SQL LIKE per keystroke", steps: [
      { at: 0, say: "Each keystroke runs SELECT … WHERE query LIKE 'how to b%' ORDER BY count DESC LIMIT 10.", dead: ["trie", "cdn"], label: { trie: "(no trie)", cdn: "(no CDN)" }, load: { svc: 50, db: 60 }, rate: 12,
        meters: { rps: ["150k/s", "ok"], p99: ["120 ms", "warn"], err: ["0%", "ok"], cost: ["$8k", "ok"] },
        routes: [{ p: 1, path: ["users", "svc", "db"], cls: "db" }] },
      { at: 2600, say: "Prefix scans plus sorting, 150k times a second. The database can't keep up.", queue: "db", load: { db: 100 }, meters: { p99: ["3 s", "bad"] } },
      { at: 5800, say: "Suggestions arrive after the user has finished typing, if at all.", fx: [["db", "under", 0]], meters: { err: ["40%", "bad"] } },
      { at: 9500, end: true },
    ] },
  }),

  "file-sync": demo({
    title: "See it in action: editing one line of a 1 GB file",
    intro: "Someone fixes a typo in a huge file on their laptop, and it syncs to their phone.",
    nodes: [
      { id: "laptop", t: "client", kind: "client", label: "Laptop", at: [0.1, 0.5] },
      { id: "api", t: "app", kind: "service", label: "Metadata service", at: [0.45, 0.2], n: [0.27, 0.5] },
      { id: "store", t: "blob", kind: "store", label: "Chunk storage", at: [0.45, 0.8], n: [0.73, 0.5], bar: "load" },
      { id: "phone", t: "client", kind: "client", label: "Phone", at: [0.85, 0.5] },
    ],
    links: [["laptop", "api"], ["laptop", "store"], ["api", "phone"], ["store", "phone"]],
    meters: [["rps", "Uploaded"], ["p99", "Sync time"], ["err", "Conflicts"], M.cost],
    good: { label: "Changed chunks only", steps: [
      { at: 0, say: "The client splits the file into 4 MB chunks by content hash and asks which ones the server doesn't have.", load: { store: 5 }, rate: 2,
        meters: { rps: ["4 MB", "ok"], p99: ["2 s", "ok"], err: ["0", "ok"], cost: ["$", "ok"] },
        routes: [{ p: 0.5, path: ["laptop", "store"], cls: "db" }, { p: 0.5, path: ["laptop", "api"], cls: "ok" }] },
      { at: 3500, say: "Only the one changed chunk is uploaded. The new version is committed, and the phone downloads just that chunk.",
        routes: [{ p: 0.5, path: ["store", "phone"], cls: "hit" }, { p: 0.5, path: ["api", "phone"], cls: "ok" }] },
      { at: 7000, say: "4 MB moved instead of 1 GB: seconds, not minutes.", fx: [["store", "spot", 0], ["phone", "spot", 250]] },
      { at: 10500, end: true },
    ] },
    bad: { label: "Whole file every time", steps: [
      { at: 0, say: "No chunking: every save re-uploads the whole 1 GB file.", load: { store: 40 }, rate: 13,
        meters: { rps: ["1 GB", "warn"], p99: ["4 min", "warn"], err: ["0", "ok"], cost: ["$", "ok"] },
        routes: [{ p: 1, path: ["laptop", "store"], cls: "db" }] },
      { at: 3000, say: "Multiply by millions of users saving all day: petabytes of pointless uploads.", load: { store: 100 }, queue: "store", meters: { p99: ["20 min", "bad"], cost: ["$$$$", "bad"] } },
      { at: 6200, say: "Storage bandwidth melts down, sync takes forever, and the bill explodes.", fx: [["store", "over", 0]], coins: "store", meters: { err: ["edits clash", "bad"] } },
      { at: 9800, end: true },
    ] },
  }),
};

export default demos;
