---
title: How to approach a system design interview
navTitle: The interview framework
order: 1
summary: A repeatable, seven-step framework for a 45-minute design interview, and what interviewers are actually scoring while you talk.
glance:
  - "There is no single right answer. Interviewers score **how you reason**: requirements, trade-offs and communication."
  - "Use the same seven steps every time: requirements, estimates, API, data model, high-level design, deep dives, wrap-up."
  - "Spend the first ~5 minutes asking questions. Designing the wrong system well still fails."
  - "Say your trade-offs out loud: *I'm choosing X because Y; the cost is Z.*"
---
A system design interview asks you to design something big, like "design Twitter" or "design a URL shortener", in about 45 minutes. Nobody expects a production-ready design in that time. The interviewer wants to see **how you think**: whether you clarify a vague problem, make reasonable assumptions, pick sensible building blocks, and explain the trade-offs behind each choice.

This page is the framework. Every walkthrough in the [practice section](/practice/url-shortener/) follows it.

## The seven steps

{% diagram "The framework: the same path through every question" %}
req: 1. Requirements @ 0,0
est: 2. Estimates @ 1,0
api: 3. API @ 2,0
data: 4. Data model @ 3,0
hl: 5. High-level\ndesign [lb] @ 3,1
deep: 6. Deep dives [cache] @ 2,1
wrap: 7. Wrap-up @ 1,1
req -> est
est -> api
api -> data
data -> hl
hl -> deep
deep -> wrap
{% enddiagram %}

| Step | Time | What you produce |
|---|---|---|
| 1. Requirements | ~5 min | Functional features in scope, non-functional goals (scale, latency, availability, consistency) |
| 2. Estimates | ~3–5 min | Requests per second, storage, bandwidth: enough to know what's hard |
| 3. API | ~3 min | The handful of endpoints or messages the system exposes |
| 4. Data model | ~3 min | Main entities, their keys, and how they're queried |
| 5. High-level design | ~10 min | A box-and-arrow diagram covering every requirement end to end |
| 6. Deep dives | ~15 min | Two or three hard parts in detail, usually the ones the interviewer picks |
| 7. Wrap-up | ~3 min | Bottlenecks, failure modes, what you'd do with more time |

### 1. Clarify requirements

Split them into two lists:

- **Functional requirements**: what the system does. "Users can post a tweet", "users see a timeline of people they follow". Agree on 3–5 core features and explicitly park the rest ("I'll leave out DMs and ads unless you want them").
- **Non-functional requirements**: how well it does it. Scale (daily active users, read/write ratio), latency targets, availability, consistency needs, durability.

{% callout "think", "Thinking out loud" %}
"Before I draw anything: is this read-heavy or write-heavy? Is it OK if a new post takes a few seconds to appear for followers, or does it need to be instant? Those two answers change the whole design."
{% endcallout %}

### 2. Estimate

Quick arithmetic tells you *which parts are hard*. 100 writes per second is a single database; 100,000 is not. See [back-of-the-envelope estimation](/topics/estimation/). Round aggressively, because the order of magnitude is what matters.

### 3. Define the API

A few endpoints make the requirements concrete and expose hidden questions, like pagination, idempotency and auth. For example, `POST /urls {long_url} → {short_code}` and `GET /{short_code} → 301 redirect`.

### 4. Sketch the data model

List the main entities, their primary keys, and the queries you need. The access patterns drive the database choice, not the other way round. See [SQL vs NoSQL](/topics/databases/).

### 5. Draw the high-level design

Start simple: client, load balancer, stateless app servers, database. Then add pieces *only when a requirement or estimate demands them*: a cache because reads are 100× writes, a queue because fan-out is slow, a CDN because media is large.

### 6. Deep dive

The interviewer will usually point at something: "how does the feed get built?", "what happens when this node dies?". This is where most of the score comes from. Discuss at least two options and pick one with a reason.

### 7. Wrap up

Name the bottlenecks and single points of failure, how you'd monitor the system, and what you'd change at 10× scale.

## What interviewers are scoring

{% procon %}
- Clarifies before designing
- Makes and states assumptions
- Uses numbers to justify choices
- Compares options and names trade-offs
- Covers failure: what breaks, and what happens then
- Communicates clearly and takes hints
---cons---
- Jumps straight to drawing boxes
- Name-drops technologies without a reason ("we'll use Kafka")
- Over-engineers for scale nobody asked for
- Goes silent while thinking
- Defends one design instead of weighing alternatives
- Ignores the interviewer's steer
{% endprocon %}

## Habits that help

- **Narrate.** Silence reads as being stuck. "I'm weighing a cache here; let me check the read/write ratio first."
- **Start simple, then evolve.** A working simple design you improve beats an elaborate one with gaps.
- **Use trade-off language.** "*X* gives us *A* at the cost of *B*; given our requirement for *C*, I'd pick *X*."
- **Keep a requirements checklist on the board** and tick it off as your design covers each item.
- **Know the building blocks.** The [fundamentals](/topics/estimation/) in this guide are the vocabulary; the practice questions are where you combine them.

{% callout "interview", "In the interview" %}
If you get stuck, go back to the requirements: "Our hardest requirement is low-latency reads at 50k QPS, so let me focus the design there." It shows judgment and buys you time.
{% endcallout %}
