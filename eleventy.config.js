// System Design Study Guide — Eleventy config.
// Pages live in src/ (topics/, practice/), static files in assets/, output in _site/.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import markdownIt from "markdown-it";

/* ==========================================================================
   Diagrams: a small text format rendered to SVG at build time
   --------------------------------------------------------------------------
   {% diagram "Caption" %}
   client: Client [client] @ 0,1        node  — id: Label [kind] @ column,row
   lb: Load balancer [lb] @ 1,1                  kinds: client lb service db cache
   db: Primary\nDB [db] @ 2,1                    queue cdn store worker ext
   [[Region A]] @ 1,0 - 2,2             group — a dashed box around cells
   client -> lb : HTTPS                 edges — ->  solid arrow
   lb --> db                                   --> dashed (async) arrow
                                               <-> both ways,  -- plain line
   {% enddiagram %}
   ========================================================================== */
const COL = 184, ROW = 106, PAD = 20, BOX_W = 148, LINE_H = 17;

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function parseDiagram(spec) {
  const nodes = {}, edges = [], groups = [];
  for (const raw of spec.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let m;
    if ((m = line.match(/^\[\[(.+?)\]\]\s*@\s*([\d.]+)\s*,\s*([\d.]+)\s*-\s*([\d.]+)\s*,\s*([\d.]+)$/))) {
      groups.push({ label: m[1], c1: +m[2], r1: +m[3], c2: +m[4], r2: +m[5] });
    } else if ((m = line.match(/^(\w+)\s*:\s*(.+?)\s*(?:\[(\w+)\])?\s*@\s*([\d.]+)\s*,\s*([\d.]+)$/))) {
      nodes[m[1]] = { id: m[1], lines: m[2].split("\\n"), kind: m[3] || "service", c: +m[4], r: +m[5] };
    } else if ((m = line.match(/^(\w+)\s*(<->|-->|->|--)\s*(\w+)\s*(?::\s*(.+))?$/))) {
      edges.push({ a: m[1], op: m[2], b: m[3], label: m[4] || "" });
    } else {
      throw new Error(`diagram: can't parse "${line}"`);
    }
  }
  for (const e of edges) {
    if (!nodes[e.a] || !nodes[e.b]) throw new Error(`diagram: edge ${e.a} ${e.op} ${e.b} uses an unknown node`);
  }
  return { nodes, edges, groups };
}

function nodeGeom(n) {
  const h = 46 + LINE_H * (n.lines.length - 1) + (n.kind === "db" ? 10 : 0);
  return { x: PAD + n.c * COL + COL / 2, y: PAD + n.r * ROW + ROW / 2, w: BOX_W, h };
}

// where the line from a box's centre towards (dx, dy) leaves the box
function clip(g, dx, dy, gap) {
  const t = Math.min((g.w / 2 + gap) / Math.abs(dx || 1e-9), (g.h / 2 + gap) / Math.abs(dy || 1e-9));
  return [g.x + dx * t, g.y + dy * t];
}

function nodeSvg(n) {
  const g = nodeGeom(n), x = g.x - g.w / 2, y = g.y - g.h / 2;
  let shape;
  if (n.kind === "db" || n.kind === "store") {
    const ry = 8, rx = g.w / 2;
    shape = `<path class="d-shape" d="M${x} ${y + ry}a${rx} ${ry} 0 0 0 ${g.w} 0a${rx} ${ry} 0 0 0 ${-g.w} 0v${g.h - 2 * ry}a${rx} ${ry} 0 0 0 ${g.w} 0v${-(g.h - 2 * ry)}"/>` +
            `<path class="d-shape d-shape--rim" d="M${x} ${y + ry}a${rx} ${ry} 0 0 0 ${g.w} 0"/>`;
  } else {
    const r = n.kind === "client" ? g.h / 2 : 8;
    shape = `<rect class="d-shape" x="${x}" y="${y}" width="${g.w}" height="${g.h}" rx="${r}"/>`;
    if (n.kind === "queue") {
      for (let i = 1; i <= 3; i++) shape += `<path class="d-shape d-shape--rim" d="M${x + g.w - 10 * i} ${y + 7}v${g.h - 14}"/>`;
    }
  }
  const textY = g.y + (n.kind === "db" || n.kind === "store" ? 5 : 0) - ((n.lines.length - 1) * LINE_H) / 2;
  const text = n.lines.map((l, i) => `<tspan x="${g.x - (n.kind === "queue" ? 12 : 0)}" y="${textY + i * LINE_H}">${esc(l)}</tspan>`).join("");
  return `<g class="d-node d-node--${n.kind}">${shape}<text class="d-label" dominant-baseline="middle">${text}</text></g>`;
}

function edgeSvg(e, d) {
  const A = nodeGeom(d.nodes[e.a]), B = nodeGeom(d.nodes[e.b]);
  let dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1;
  // two edges between the same pair (one each way) sit side by side
  const twin = d.edges.some((o) => o !== e && o.a === e.b && o.b === e.a);
  const off = twin ? 7 : 0, ox = (-dy / len) * off, oy = (dx / len) * off;
  const [x1, y1] = clip(A, dx, dy, e.op === "<->" ? 5 : 2);
  const [x2, y2] = clip(B, -dx, -dy, e.op === "--" ? 2 : 5);
  const cls = e.op === "-->" ? "d-edge d-edge--async" : "d-edge";
  const start = e.op === "<->" ? ' marker-start="url(#d-arrow-rev)"' : "";
  const end = e.op === "--" ? "" : ' marker-end="url(#d-arrow)"';
  const line = `<path class="${cls}" d="M${(x1 + ox).toFixed(1)} ${(y1 + oy).toFixed(1)}L${(x2 + ox).toFixed(1)} ${(y2 + oy).toFixed(1)}"${start}${end}/>`;
  let label = "";
  if (e.label) {
    // flat arrows get their label just above the line; others sit on it, with a halo
    const flat = Math.abs(dy) < Math.abs(dx) * 0.35;
    const mx = (x1 + x2) / 2 + ox * 2.4, my = (y1 + y2) / 2 + oy * 2.4 - (flat ? 11 : 0);
    label = `<text class="d-elabel" x="${mx.toFixed(1)}" y="${my.toFixed(1)}" dominant-baseline="middle" text-anchor="middle">${esc(e.label)}</text>`;
  }
  return { line, label };
}

function renderDiagram(spec, caption) {
  const d = parseDiagram(spec);
  const ns = Object.values(d.nodes);
  const cols = Math.max(...ns.map((n) => n.c), ...d.groups.map((g) => g.c2)) + 1;
  const rows = Math.max(...ns.map((n) => n.r), ...d.groups.map((g) => g.r2)) + 1;
  const W = Math.ceil(PAD * 2 + cols * COL), H = Math.ceil(PAD * 2 + rows * ROW);
  const groups = d.groups.map((g) => {
    const x = PAD + g.c1 * COL + 8, y = PAD + g.r1 * ROW + 4;
    const w = (g.c2 - g.c1 + 1) * COL - 16, h = (g.r2 - g.r1 + 1) * ROW - 8;
    return `<rect class="d-group" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text class="d-glabel" x="${x + 12}" y="${y + 18}">${esc(g.label)}</text>`;
  }).join("");
  const desc = d.edges.map((e) => {
    const name = (id) => d.nodes[id].lines.join(" ");
    return `${name(e.a)} ${e.op === "<->" ? "and" : "to"} ${name(e.b)}${e.label ? ` (${e.label})` : ""}`;
  }).join("; ");
  const svg =
    `<svg class="d" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="${esc(`${caption}. ${desc}.`)}">` +
    `<defs><marker id="d-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="d-head" d="M0 0L10 5L0 10z"/></marker>` +
    `<marker id="d-arrow-rev" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="d-head" d="M10 0L0 5L10 10z"/></marker></defs>` +
    groups + d.edges.map((e) => edgeSvg(e, d).line).join("") + ns.map(nodeSvg).join("") +
    d.edges.map((e) => edgeSvg(e, d).label).join("") + `</svg>`;     // labels on top of everything
  return `<figure class="diagram"><div class="diagram__scroll">${svg}</div><figcaption>${esc(caption)}</figcaption></figure>`;
}

/* ==========================================================================
   Markdown
   ========================================================================== */
function slugify(s) {
  return s.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });

  const md = markdownIt({ html: true, typographer: true });
  // ids on headings, for the "On this page" list and deep links
  md.core.ruler.push("heading_ids", (state) => {
    const used = new Set();
    state.tokens.forEach((t, i) => {
      if (t.type !== "heading_open" || t.attrGet("id")) return;
      let id = slugify(state.tokens[i + 1].content) || "section", n = 2;
      while (used.has(id)) id = `${id}-${n++}`;
      used.add(id);
      t.attrSet("id", id);
    });
  });
  md.renderer.rules.table_open = () => '<div class="table-scroll"><table>\n';
  md.renderer.rules.table_close = () => "</table></div>\n";
  eleventyConfig.setLibrary("md", md);
  const block = (content) => md.render(content.replace(/^\n+|\n+$/g, "")).trim();

  eleventyConfig.addPairedShortcode("diagram", (spec, caption) => renderDiagram(spec, caption));

  // {% callout "tip" | "warn" | "interview" | "think", "Title" %} … {% endcallout %}
  eleventyConfig.addPairedShortcode("callout", (content, kind, title) =>
    `<aside class="callout callout--${kind}"><p class="callout__title">${title}</p>${block(content)}</aside>`);

  // {% procon %} pros … ---cons--- cons … {% endprocon %}
  // {% procon "TCP", "UDP" %} … for a side-by-side comparison instead of pros and cons
  eleventyConfig.addPairedShortcode("procon", (content, left, right) => {
    const [a, b] = content.split(/^\s*---cons---\s*$/m);
    const compare = Boolean(left);
    return `<div class="procon${compare ? " procon--compare" : ""}">` +
           `<div class="procon__col procon__col--pro"><p class="procon__title">${left || "Pros"}</p>${block(a)}</div>` +
           `<div class="procon__col procon__col--con"><p class="procon__title">${right || "Cons"}</p>${block(b || "")}</div></div>`;
  });

  /* ---- Filters ---------------------------------------------------------- */
  const hashes = new Map();
  eleventyConfig.addFilter("v", (url) => {
    if (!hashes.has(url)) hashes.set(url, createHash("md5").update(readFileSync(`.${url}`)).digest("hex").slice(0, 8));
    return `${url}?v=${hashes.get(url)}`;
  });
  eleventyConfig.on("eleventy.before", () => hashes.clear());

  // "On this page": the h2s of the rendered content
  eleventyConfig.addFilter("toc", (html) =>
    [...String(html).matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)].map((m) => ({ id: m[1], text: m[2].replace(/<[^>]+>/g, "") })));
  eleventyConfig.addFilter("headingsText", (html) =>
    [...String(html).matchAll(/<h[23] id="[^"]+">(.*?)<\/h[23]>/g)].map((m) => m[1].replace(/<[^>]+>/g, "")).join(" · "));
  eleventyConfig.addFilter("plain", (html) => String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  eleventyConfig.addFilter("cardsFor", (cards, topic) => cards.filter((c) => c.topic === topic));
  eleventyConfig.addFilter("pad2", (n) => String(n).padStart(2, "0"));
  eleventyConfig.addFilter("md", (s) => md.renderInline(String(s)));
  // The quiz deck for the flashcards page: rendered HTML plus the page title each card belongs to.
  // `</` is escaped so the JSON can sit safely inside a <script> tag.
  eleventyConfig.addFilter("deckJson", (cards, pages) => {
    const titles = {};
    for (const p of pages) titles[p.data.cards || p.fileSlug] = p.data.navTitle || p.data.title;
    const deck = cards.map((c) => ({
      topic: c.topic,
      topicTitle: titles[c.topic] || c.topic,
      frontHtml: md.renderInline(c.front),
      backHtml: md.renderInline(c.back),
    }));
    return JSON.stringify(deck).replace(/<\//g, "<\\/");
  });

  /* ---- Collections ------------------------------------------------------ */
  const byOrder = (a, b) => a.data.order - b.data.order;
  eleventyConfig.addCollection("topics", (api) => api.getFilteredByTag("topic").sort(byOrder));
  eleventyConfig.addCollection("practice", (api) => api.getFilteredByTag("practice").sort(byOrder));

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
