# ZKME Output — Start Here

Repository: `A:\git\LiveAzan`
Scale: 179 files, 355 symbols, 108 interfaces
Languages: json (68), typescript (59), unknown (18), xml (10), python (4)

## Quick Start (3-file orientation)

1. **Read `AI_INSTRUCTIONS.md`** — rules + complete file listing
2. **Read `SYSTEM_OVERVIEW.md`** — what this repo is, scale, tech stack
3. **Read `KNOWN_HAZARDS.md`** — what not to break

## Directory Structure

| Directory | Contents | Trust Level |
|-----------|----------|-------------|
| `static/` | Ground truth JSONs (files, symbols, routes, schemas, imports, call graph, hazards, etc.) | **Authoritative** |
| `ZKME_CONTEXT_PACK/` | Tiered summaries: Tier1 = core truth, Tier2 = per-feature, Tier3 = reference links | **Authoritative** |
| `GIT_LEARNING/` | Git history signals (hot files, co-change coupling, author ownership) | **Guidance only** |
| `llm/` | Optional LLM enrichment outputs | **Derived** |

## What to Read Based on Your Task

### Bug Analysis / Fix Planning
1. `KNOWN_HAZARDS.md` — sensitive areas that could break
2. `static/hot_files.json` — most important files ranked with reasons
3. `static/frontend_calls.json` + `static/routes_detected.json` — API surface
4. `ZKME_CHANGE_IMPACT.json` — 2-hop change impact graph
5. `ZKME_PATHS.json` — golden paths (interface -> call chain -> DB)

### Requirement / Feature Planning
1. `SYSTEM_OVERVIEW.md` — repo scale, languages, interfaces
2. `L2_CONTEXT.md` — entry points, data models, call chains, config
3. `INTERFACE_CATALOG.json` — all API endpoints
4. `ZKME_FEATURE_REGISTRY.json` — existing features with core files
5. `FEATURE_INDEX.md` — keyword-searchable feature finder

### Test Planning
1. `static/flow_graph.v1.json` — end-to-end user flow graph
2. `static/negative_test_matrix.v1.json` — negative test scenarios
3. `static/assertion_anchors.v1.json` — existing test assertion locations
4. `static/auth_contract.v1.json` — authorization rules to test
5. `static/ui_event_bindings.v1.json` — UI-to-API event bindings

### Task / Refactoring
1. `ZKME_CHANGE_IMPACT.json` — blast radius for files you plan to change
2. `ZKME_CONTRACTS_INVARIANTS.json` — invariants that must be preserved
3. `static/hierarchy.json` — class inheritance chains
4. `static/call_graph.json` — function call edges
5. `ZKME_PATCH_PLANNING_PACK.md` — pre-change checklist

## Key Artifacts Quick Reference

| If you need... | Read this file |
|----------------|---------------|
| Repo overview | `SYSTEM_OVERVIEW.md` |
| API endpoints | `INTERFACE_CATALOG.json` or `static/routes_detected.json` |
| Data models / schemas | `static/schemas.json` |
| What breaks if I change X | `ZKME_CHANGE_IMPACT.json` |
| Existing features | `FEATURE_INDEX.md` or `ZKME_FEATURE_REGISTRY.json` |
| Dangerous areas | `KNOWN_HAZARDS.md` |
| Auth / permission rules | `static/auth_contract.v1.json` |
| Test coverage gaps | `static/assertion_anchors.v1.json` |
| Frontend-to-Backend mapping | `static/frontend_calls.json` |
| Database schema / migrations | `static/database_schema.json` |
| Git history hot spots | `GIT_LEARNING/10_HOT_FILES.csv` |
| Full working context | `L2_CONTEXT.md` |
| Feature deep dive | `ZKME_CONTEXT_PACK/02_TIER2_FEATURES/feature_*.md` |

## Rules

- `static/` files are **facts** (authoritative). `GIT_LEARNING/` files are **guidance** (heuristic).
- If you cannot prove a claim from these artifacts or the source code, say **UNKNOWN**.
- For every file you change or recommend changing, cite which artifact(s) informed the decision.

## Small / Local Model Quick Start

If you have limited context (< 32K tokens), use these artifacts instead of the full static/ JSONs:

1. **Read `MANIFEST.json`** — file counts, validation status, artifact list
2. **Pick your mode** (BUG, TASK, REQ, or TEST)
3. **Read `PACKS/<MODE>/default/pointers.jsonl`** — ranked chunk references
4. **Load chunks** from `CHUNKS/` as referenced by pointers
5. **Check `VALIDATION/validate_report.json`** — ensure output is complete

Budget: each pack stays under 6000 lines / 60 chunks.

