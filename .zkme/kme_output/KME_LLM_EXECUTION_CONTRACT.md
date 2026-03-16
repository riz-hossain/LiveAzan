# KME LLM Execution Contract

This contract governs how LLM stages interact with ZKME artifacts.

## Authoritative Instructions

- `ZKME_AI_INSTRUCTIONS.md` — AI navigation guide for kme_output/
- `CLAUDE.md` — Development context for the ZAI-KME codebase itself

## Contract Rules

1. **Static artifacts are ground truth.** LLM stages must not contradict `kme_output/static/` data.
2. **Evidence-first.** Every claim in LLM output must trace to file:line evidence from the scan.
3. **Confidence-scored.** LLM stages inherit confidence from the underlying artifacts.
4. **Bounded.** LLM stages operate on capped input (file counts, token budgets) to prevent cost runaway.
5. **Cite artifacts.** Every file recommendation must list which artifacts informed the decision.

## LLM Stage Pipeline

When `--analysis-model` is provided, ZKME runs a two-stage pipeline:
- **Stage 1 (Analysis)**: Reads CEP + artifacts, produces analysis document
- **Stage 2 (Solution)**: Reads analysis + artifacts, produces actionable solution

If this file appears inside `kme_output/`, it is a compatibility pointer to this root file.
