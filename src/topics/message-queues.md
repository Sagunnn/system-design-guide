---
title: Message queues and event streaming
navTitle: Queues & streams
order: 14
summary: Decouple services with queues and logs. Covers point-to-point vs pub/sub, Kafka-style logs, delivery guarantees, ordering, retries and dead-letter queues.
glance:
  - "Queues let producers hand off work **asynchronously**, smoothing spikes and decoupling services."
  - "**Queue** (each message to one consumer) vs **pub/sub** (each message to every subscriber) vs **log** (Kafka: replayable, ordered per partition)."
  - "Most systems give **at-least-once** delivery, so make consumers **idempotent**."
  - "Order is guaranteed only **within a partition**; poison messages go to a **dead-letter queue**."
---
A **message queue** sits between services: a producer writes a message and moves on, and a consumer processes it later. Work that doesn't need to finish before the user gets a response, like sending emails, resizing images or updating feeds, belongs behind a queue.

{% diagram "Producers hand work to a queue; a consumer group shares it; failures go to a dead-letter queue" %}
p1: API server [service] @ 0,0
p2: API server [service] @ 0,2
q: Queue / topic [queue] @ 1,1
w1: Worker 1 [worker] @ 2,0
w2: Worker 2 [worker] @ 2,1
w3: Worker 3 [worker] @ 2,2
dlq: Dead-letter\nqueue [queue] @ 3,1
p1 -> q
p2 -> q
q --> w1
q --> w2
q --> w3
w2 -> dlq : after N failures
{% enddiagram %}

## Why use a queue

- **Decoupling**: producers don't need to know who consumes, or whether they're up right now.
- **Load levelling**: a spike of 10,000 jobs waits in the queue instead of overwhelming workers.
- **Faster responses**: the API returns as soon as the job is queued.
- **Scaling**: add workers to drain faster.
- **Resilience**: if a consumer crashes, messages wait instead of being lost.

## Three styles

| Style | Delivery | Retention | Examples |
|---|---|---|---|
| **Work queue** (point-to-point) | Each message to **one** consumer | Deleted when processed | SQS, RabbitMQ |
| **Pub/sub** | Each message to **every** subscriber | Usually short | SNS, Google Pub/Sub, Redis Pub/Sub |
| **Log / stream** | Consumers track their own position; many groups read the same data | Kept for days or forever; **replayable** | Kafka, Kinesis, Pulsar |

A **log** like Kafka is append-only and split into **partitions**. Each consumer group reads every partition, and within a group each partition is read by one consumer. Because data is retained, you can add a new consumer later and replay history, which makes logs the backbone of event-driven systems and stream processing.

## Delivery guarantees

- **At-most-once**: may lose messages, never duplicates (acknowledge before processing).
- **At-least-once**: never loses, may **duplicate** (acknowledge after processing). **This is the common default.**
- **Exactly-once**: very hard end to end. In practice you get *effectively once* through **at-least-once delivery plus idempotent consumers**: dedupe by message ID, or design updates so applying them twice is harmless (`SET status = 'paid'`, not `balance += 10`).

## Ordering

- Global ordering doesn't scale. Kafka orders messages **within a partition**.
- Choose a **partition key** that groups messages needing order: all events for `order_id = 42` go to the same partition, so they're processed in order.

## When things fail

- **Retries with backoff** for transient errors (see [reliability](/topics/reliability/)).
- **Visibility timeout** (SQS): a message is hidden while being processed and reappears if the worker dies.
- **Dead-letter queue (DLQ)**: after N failed attempts, park the message for inspection instead of blocking the queue forever.
- **Backpressure**: watch queue depth and consumer lag; scale consumers or slow producers when they grow.

{% procon %}
- Decouples services; failures don't cascade immediately
- Absorbs traffic spikes
- Enables async processing and fan-out
- Logs give replay, audit and stream processing
---cons---
- Eventual: results aren't immediate
- Duplicates and reordering to handle
- More infrastructure to operate and monitor
- Harder debugging: requests become chains of events
{% endprocon %}

{% callout "interview", "In the interview" %}
Whenever something is slow, bursty or fan-out-heavy (notifications, video transcoding, feed updates), put a queue there and say three things: the delivery guarantee (at-least-once), how consumers stay idempotent, and what happens to poison messages (a DLQ).
{% endcallout %}
