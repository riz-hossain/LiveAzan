# ZeuZ Knowledge Map Engine (ZKME) v2.13.0 — AI Instructions

ZKME scans a repository and generates an AI-ready `kme_output/` folder containing 100+ analysis artifacts. This file tells any AI how to navigate that output.

## Load Order (token-efficient)

1. `kme_output/00_START_HERE.md` — navigation guide with task-specific routing
2. `kme_output/AI_INSTRUCTIONS.md` — rules + complete artifact listing
3. `kme_output/SYSTEM_OVERVIEW.md` — repo scale, languages, interfaces
4. `kme_output/KNOWN_HAZARDS.md` — what not to break
5. Task-specific files (see below)
6. `kme_output/static/` JSONs for precise, provable answers
7. `kme_output/GIT_LEARNING/` for risk/intent heuristics (guidance only, **not facts**)

## Non-negotiable rules

1. **`static/` is authoritative.** Do not contradict it.
2. **Use the artifacts before proposing changes.** If a relevant artifact is missing, say **UNKNOWN**.
3. **For every file you change (or recommend changing), list the artifacts you used.**
4. If hard facts conflict with soft guidance, **hard facts win**.

## Output Structure

```
kme_output/
  00_START_HERE.md              ← READ FIRST — navigation guide
  AI_INSTRUCTIONS.md            ← Rules + file listing + task routing
  SYSTEM_OVERVIEW.md            ← Repo overview (scale, stack, interfaces)
  KNOWN_HAZARDS.md              ← Dangerous areas
  L2_CONTEXT.md                 ← Working context (entry points, models, config)
  FEATURE_INDEX.md              ← Feature finder (keyword-searchable)
  INTERFACE_CATALOG.json        ← All API endpoints
  ZKME_FEATURE_REGISTRY.json    ← Features with core files + confidence
  ZKME_CHANGE_IMPACT.json       ← 2-hop blast radius
  ZKME_CONTRACTS_INVARIANTS.json← Invariants that must be preserved
  ZKME_PATHS.json               ← Golden paths (interface → call → DB)
  static/                       ← Ground truth JSONs (files, symbols, routes, schemas, etc.)
  ZKME_CONTEXT_PACK/            ← Tiered summaries (Tier1 core, Tier2 per-feature, Tier3 refs)
  GIT_LEARNING/                 ← Git history signals (soft guidance only)
```

## Task-Specific Navigation

### Bug Analysis / Fix Planning
1. `KNOWN_HAZARDS.md` — sensitive areas
2. `static/hot_files.json` — most important files ranked
3. `static/frontend_calls.json` + `static/routes_detected.json` — API surface
4. `ZKME_CHANGE_IMPACT.json` — blast radius
5. `ZKME_PATHS.json` — golden paths

### Requirement / Feature Planning
1. `SYSTEM_OVERVIEW.md` — repo scale, interfaces
2. `L2_CONTEXT.md` — entry points, data models, call chains
3. `INTERFACE_CATALOG.json` — all API endpoints
4. `ZKME_FEATURE_REGISTRY.json` — existing features
5. `FEATURE_INDEX.md` — keyword search
6. `ZKME_CONTRACTS_INVARIANTS.json` — rules to preserve

### Test Planning
1. `static/flow_graph.v1.json` — user flow graph
2. `static/negative_test_matrix.v1.json` — negative scenarios
3. `static/assertion_anchors.v1.json` — existing test locations
4. `static/auth_contract.v1.json` — auth rules to test
5. `static/ui_event_bindings.v1.json` — UI-to-API bindings

### Task / Refactoring
1. `ZKME_CHANGE_IMPACT.json` — blast radius
2. `ZKME_CONTRACTS_INVARIANTS.json` — invariants
3. `static/hierarchy.json` — class inheritance
4. `static/call_graph.json` — call edges
5. `ZKME_PATCH_PLANNING_PACK.md` — pre-change checklist

## Quick Reference

| If you need... | Read this file |
|----------------|---------------|
| Repo overview | `SYSTEM_OVERVIEW.md` |
| API endpoints | `INTERFACE_CATALOG.json` |
| Data models | `static/schemas.json` |
| Change impact | `ZKME_CHANGE_IMPACT.json` |
| Features | `FEATURE_INDEX.md` |
| Hazards | `KNOWN_HAZARDS.md` |
| Auth rules | `static/auth_contract.v1.json` |
| Frontend-Backend mapping | `static/frontend_calls.json` |
| Database | `static/database_schema.json` |
| Git hot spots | `GIT_LEARNING/10_HOT_FILES.csv` |
| Full context | `L2_CONTEXT.md` |

## End-user prompt (keep it short)
> **Make the safest change to <YOUR_GOAL>. Follow ZKME rules and cite artifacts used for each edited file.**
