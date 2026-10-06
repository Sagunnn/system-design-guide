---
title: "Networking basics: DNS, TCP, UDP and HTTP"
navTitle: Networking basics
order: 3
summary: What happens between typing a URL and seeing a page, and the networking choices (TCP vs UDP, HTTP versions, proxies) that show up in every design.
glance:
  - "**DNS** turns a name into an IP address; results are cached at many layers, with a TTL."
  - "**TCP** is reliable and ordered; **UDP** is fast but best-effort, good for video calls and games."
  - "HTTP/2 multiplexes requests over one connection; **HTTP/3 runs over QUIC (UDP)**."
  - "A **reverse proxy** sits in front of servers (TLS, caching, routing); a forward proxy sits in front of clients."
---
Almost every design starts with "the client sends a request". Knowing what that request goes through helps you place load balancers, CDNs and caches correctly, and explains where latency comes from.

## What happens when you open a URL

{% diagram "The journey of a request" %}
browser: Browser [client] @ 0,1
dns: DNS resolver [ext] @ 1,0
cdn: CDN edge [cdn] @ 1,2
lb: Load balancer [lb] @ 2,1
app: App server @ 3,1
db: Database [db] @ 4,1
browser -> dns : 1. resolve name
browser -> lb : 2. TCP + TLS, HTTP
browser -> cdn : static files
lb -> app : 3. route
app -> db : 4. query
{% enddiagram %}

1. **DNS lookup.** The browser asks a resolver for the IP of `example.com`. The answer is cached by the browser, the OS and the resolver for its **TTL** (time to live).
2. **Connection.** A TCP handshake (one round trip), then a TLS handshake for HTTPS (one more with TLS 1.3).
3. **Request.** The HTTP request reaches a load balancer or reverse proxy, which forwards it to an application server.
4. **Response.** The server queries its data stores and responds. Static assets usually come from a CDN instead.

## DNS

DNS is a distributed, hierarchical, heavily cached phone book: root servers → TLD servers (`.com`) → the domain's authoritative servers.

- **Record types:** `A`/`AAAA` (name → IPv4/IPv6), `CNAME` (alias to another name), `MX` (mail), `TXT` (verification, SPF).
- **DNS load balancing:** return several IPs, or different IPs by geography (GeoDNS), to spread users across regions.
- **Caveat:** because of caching, DNS changes propagate slowly. Use short TTLs before a planned migration.

## TCP vs UDP

{% procon "TCP", "UDP" %}
- Reliable: lost packets are re-sent
- Ordered: bytes arrive in order
- Congestion control is built in
- Right for HTTP, databases, file transfer, anything that must be correct
---cons---
- No handshake, no retransmits: lower latency
- Packets can be lost or reordered; the app decides what to do
- Right for live video and voice, gaming, DNS queries, and QUIC
- Late data is worse than lost data, so retransmitting doesn't help
{% endprocon %}

## HTTP versions

| Version | Key idea | Problem it solved |
|---|---|---|
| HTTP/1.1 | Keep-alive connections | A new TCP connection per request was slow |
| HTTP/2 | Many requests multiplexed on one connection, header compression | Browsers opening 6 connections per host |
| HTTP/3 | Runs on **QUIC over UDP** | TCP's head-of-line blocking; faster connection setup, survives network changes |

### Status codes worth knowing

`200` OK · `201` Created · `301`/`302` redirects (permanent/temporary) · `304` Not Modified (cache) · `400` bad request · `401` unauthenticated · `403` forbidden · `404` not found · `409` conflict · `429` too many requests (rate limited) · `500` server error · `503` unavailable.

## Proxies

- A **forward proxy** acts for *clients*: corporate egress filtering, privacy.
- A **reverse proxy** acts for *servers*: it terminates TLS, compresses, caches, routes by path, hides internal topology. Nginx, Envoy and HAProxy are examples. A load balancer is a reverse proxy that spreads traffic.

{% callout "interview", "In the interview" %}
You rarely need to go deep on networking, but use it to explain latency: "Users in Asia hitting a US region pay ~150 ms per round trip, plus TCP and TLS setup. That's why I'd add a CDN and, at larger scale, a second region."
{% endcallout %}
