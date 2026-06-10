---
slug: spam-classifier
title: Spam Classifier From Scratch-ish
role: ml
difficulty: beginner
window:
  joinDays: 3
  buildDays: 7
  judgeDays: 3
requirements:
  - Train a classifier on a public spam/ham dataset (SMS or email)
  - Report precision, recall, and a confusion matrix on a held-out test set
  - A small CLI or web demo that classifies text typed in live
  - README explains your features and what the model gets wrong
---

Classic first ML project, judged on rigour rather than novelty. Scikit-learn is fine;
the point is the craft around the model: a clean train/test split, honest metrics, and
error analysis that shows you actually read the misclassifications. The live demo makes
it real — let judges type "FREE PRIZE CLICK NOW" themselves.

---
slug: image-search-engine
title: Semantic Image Search
role: ml
difficulty: intermediate
window:
  joinDays: 3
  buildDays: 10
  judgeDays: 3
requirements:
  - Index at least 1,000 images with embeddings (CLIP or similar pretrained model)
  - Text-to-image search with ranked results in a simple UI
  - Nearest-neighbour retrieval measurably faster than brute force (show numbers)
  - Short evaluation — 10 queries with a judgement of how relevant the top-5 are
---

Build "search my photos by describing them". Pretrained models are expected — the
skill being measured is the system around them: embedding pipelines, vector indexing
(FAISS, Annoy, pgvector…), and honest evaluation of retrieval quality. Judges reward
snappy search and a clear-eyed account of where semantic search falls flat.

---
slug: tiny-llm-agent
title: Tool-Using LLM Agent
role: ml
difficulty: advanced
window:
  joinDays: 4
  buildDays: 14
  judgeDays: 4
requirements:
  - An agent that answers questions by calling at least 3 real tools (search, calculator, your own API…)
  - Structured tool-call loop with visible reasoning trace in the UI or logs
  - Evaluation harness — 20+ test questions with pass/fail scoring, results in the README
  - Graceful failure when a tool errors or the model loops; hard cap on steps/cost
---

Build a small but disciplined agent. Any LLM provider (or a local model). What
separates entries: the harness, not the prompt — a real eval set, measured success
rates before and after changes, and engineering around the model's failure modes.
Demo a question that requires chaining two tools, and one that fails safely.
