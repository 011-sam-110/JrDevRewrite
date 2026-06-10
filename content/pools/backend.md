---
slug: url-shortener-api
title: URL Shortener API
role: backend
difficulty: beginner
window:
  joinDays: 3
  buildDays: 7
  judgeDays: 3
requirements:
  - REST endpoints to create, resolve, and delete short links
  - Per-link hit counter with a stats endpoint
  - Input validation with meaningful error responses (no bare 500s)
  - Automated tests for the core routes; one-command run documented in the README
---

The "hello world" of backend interviews, done properly. Any language, any framework,
any store (SQLite is fine). Judges look for clean route design, honest error handling,
and tests that prove the behaviour — not for exotic features. Show the API working in
your demo with real requests.

---
slug: rate-limited-gateway
title: Rate-Limited API Gateway
role: backend
difficulty: intermediate
window:
  joinDays: 3
  buildDays: 10
  judgeDays: 3
requirements:
  - Reverse-proxy requests to at least one upstream service
  - Token-bucket or sliding-window rate limiting per API key, with limit headers
  - Request logging with latency percentiles exposed on a /metrics endpoint
  - Load-test results included — show where it breaks and why
---

Build the piece of infrastructure every real platform has. The interesting work is in
the rate limiter (get the algorithm right and prove it with tests), the metrics, and
knowing your system's limits. Demo idea: hammer it with a load tool and narrate what
the dashboards show.

---
slug: event-driven-orders
title: Event-Driven Order System
role: backend
difficulty: advanced
window:
  joinDays: 4
  buildDays: 14
  judgeDays: 4
requirements:
  - Order lifecycle (placed → paid → shipped) driven by events on a queue or log
  - At-least-once delivery handled — consumers are idempotent, and you can prove it
  - One failure scenario demonstrated end to end (consumer crash, replay, recovery)
  - Architecture diagram plus a README explaining every trade-off you made
---

Design a small e-commerce order pipeline the way distributed systems actually get
built: services communicating through events (Redis Streams, RabbitMQ, Kafka, or even
a Postgres outbox). The measured skill is correctness under failure — duplicate
deliveries, out-of-order events, crashed consumers. Make the demo a war story: kill a
service mid-flow and show the system heal.
