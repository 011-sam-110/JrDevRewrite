---
name: prd
description: Design comprehensive, production-grade Product Requirements Documents (PRDs) that bridge business vision and technical execution. Use when starting a new product/feature cycle, turning a vague idea into a concrete spec, defining requirements for AI-powered features, or when the user asks to "write a PRD", "document requirements", or "plan a feature".
---

# Product Requirements Document (PRD)

## Overview

Design comprehensive, production-grade PRDs that bridge the gap between business vision and
technical execution. This skill works for modern software systems, ensuring requirements are
clearly defined and testable.

## When to use

- Starting a new product or feature development cycle.
- Translating a vague idea into a concrete technical specification.
- Defining requirements for AI-powered features.
- Stakeholders need a unified "source of truth" for project scope.
- The user asks to "write a PRD", "document requirements", or "plan a feature".

## Operational workflow

### Phase 1: Discovery (the interview)
Before writing a single line of the PRD, you MUST interrogate the user to fill knowledge gaps.
Do not assume context. Ask about:
- **The core problem:** Why are we building this now?
- **Success metrics:** How do we know it worked?
- **Constraints:** Budget, tech stack, or deadline?

### Phase 2: Analysis & scoping
Synthesize the user's input. Identify dependencies and hidden complexities.
- Map out the user flow.
- Define non-goals to protect the timeline.

### Phase 3: Technical drafting
Generate the document using the strict PRD schema below.

## PRD quality standards

Use concrete, measurable criteria. Avoid "fast", "easy", or "intuitive".

```diff
# Vague (BAD)
- The search should be fast and return relevant results.
- The UI must look modern and be easy to use.

# Concrete (GOOD)
+ The search must return results within 200ms for a 10k record dataset.
+ The search algorithm must achieve >= 85% Precision@10 in benchmark evals.
+ The UI must follow the 'Vercel/Next.js' design system and hit 100% Lighthouse Accessibility.
```

## Strict PRD schema

Follow this exact structure for the output:

1. **Executive Summary** — Problem Statement (1–2 sentences), Proposed Solution (1–2 sentences),
   Success Criteria (3–5 measurable KPIs).
2. **User Experience & Functionality** — User Personas; User Stories ("As a [user], I want to
   [action] so that [benefit]"); Acceptance Criteria (bulleted "Done" definitions); Non-Goals.
3. **AI System Requirements (if applicable)** — Tool Requirements (tools/APIs needed); Evaluation
   Strategy (how to measure output quality/accuracy).
4. **Technical Specifications** — Architecture Overview (data flow + component interaction);
   Integration Points (APIs, DBs, Auth); Security & Privacy.
5. **Risks & Roadmap** — Phased Rollout (MVP -> v1.1 -> v2.0); Technical Risks (latency, cost,
   dependency failures).

## Implementation guidelines

**DO**
- Define testing: for AI systems, specify how to test and validate output quality.
- Iterate: present a draft and ask for feedback on specific sections.

**DON'T**
- Skip discovery: never write a PRD without asking at least 2 clarifying questions first.
- Hallucinate constraints: if the user didn't specify a tech stack, ask or label it TBD.
