---
title: main.ts architecture audit
date: 2026-09-12
status: complete
scope: production TypeScript architecture
---

# `main.ts` Architecture Audit

## Executive summary

`main.ts` is a genuine architectural outlier, but it is not the largest file.
It is the composition root, a state coordinator, a storage gateway, a refresh
orchestrator, an import/export handler, and a UI bridge. Its risk comes from
responsibility breadth and fan-out, not line count alone.

The recommended first stage is guardrails. Refactoring should begin only after
those protections land and should proceed in small, independently testable
extractions.

## Repository measurements

The audit measured 161 production TypeScript files, 63,175 physical lines, and
4,425 functions.

- File-size distribution: p50 190 LOC, p75 398, p90 902, p95 1,130,
  p99 3,966; maximum 4,556.
- Function-size distribution: p50 7 LOC, p75 17, p90 38, p95 61, p99 about
  171; maximum 1,092.
- Complexity distribution: p50 1, p75 3, p90 6, p95 9, p99 22; maximum 115.
- Maximum nesting depth reached 12; parameter count reached 16.

`main.ts` is 3,468 LOC and the fourth-largest production file. Larger files are
`dashboard-view.ts` (4,556), `sidebar.ts` (4,498), and `reader-view.ts`
(3,612). `main.ts` has 29 imports and 23 production importers, making it a
high-centrality module even where other files are longer.

## Current responsibility map

- lifecycle, plugin registration, and composition root
- refresh state, scheduler, worker pool, status, and cancellation
- metadata, storage, settings loading, watching, and migrations
- image-cache queue and workers
- feed CRUD and limits
- import/export and user-settings import
- playback progress and migration
- URI handling
- article synchronization and validation
- navigation and view bridges
- factory reset

The largest seams are refresh orchestration, metadata/storage, image caching,
and import/export. They combine stateful behavior with external side effects,
which makes them high-value but higher-risk extraction candidates.

## Historical growth

On April 14, 2026, commit `2b7a1c3` reduced `main.ts` from 2,590 to 1,644
LOC. It later grew to 3,468 LOC (+1,824 across 52 commits). The largest net
additions were metadata storage location (+261), media progress (+216), image
preview disk cache (+206), secondary storage (+158), URI support (+152), and
stale-shard/storage-management work (+188 combined).

This pattern indicates recurring feature-driven re-centralization rather than a
single accidental regression. Future extractions need ownership boundaries and
ratchets, not only one-time cleanup.

## Existing boundaries and risks

- Services currently avoid importing UI/settings/main; preserve this as an
  enforceable boundary.
- Existing runtime cycles include dashboard ↔ reader and the settings cluster;
  treat new cycles as errors, but document existing allowances until removed.
- A broad “utils only point downward” rule is currently unsafe because some
  domain helpers legitimately import parser, Mastodon, and settings code.

## Recommended extraction order

1. Refresh orchestration: scheduler, worker pool, cancellation, status, and
   batch coordination.
2. Metadata/storage gateway: shard reads/writes, migrations, and watcher state.
3. Image-cache coordinator: queue, worker lifecycle, and cache policy.
4. Import/export and settings transfer: isolate serialization and validation.
5. URI/navigation bridge: narrow Obsidian-facing commands and view routing.

After `main.ts`, audit and prioritize `dashboard-view.ts`, `sidebar.ts`,
`reader-view.ts`, `discover-view.ts`, and `article-list.ts`. LOC is useful for
triage, but coupling, testability, and boundary value determine extraction
order.

## Trigger → Failure → Prevention → Validation

| Trigger                                              | Failure                                  | Prevention                                  | Validation              |
| ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------- | ----------------------- |
| Feature adds stateful behavior to `main.ts`          | composition root becomes a service layer | preflight + ratchet + responsibility review | architecture diff in PR |
| New UI code imports deeper into `main.ts`            | fan-in and coupling increase             | importer ratchet                            | dependency check        |
| Service reaches into UI/settings                     | layering erodes                          | service-boundary error                      | architecture check      |
| One-time extraction is followed by re-centralization | LOC returns without detection            | baseline update only on shrink              | CI ratchet              |
| Broad threshold is treated as policy                 | noisy or arbitrary enforcement           | measured percentile thresholds              | periodic audit          |

## Scope note

This document records the baseline and roadmap. It does not authorize a broad
`main.ts` rewrite during a release stabilization window. Guardrails and debt
reduction remain separate workstreams.
