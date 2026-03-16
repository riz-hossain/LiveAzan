# Git Learning Prompt (ZKME)

You are analyzing a repository using *only* the provided snapshot artifacts.

## Inputs
- 00_SNAPSHOT_GIT_HISTORY.json (hard facts)
- 10_HOT_FILES.csv
- 20_TOP_AUTHORS.csv
- 30_FILE_COUPLING.csv

## Tasks (in order)
1) Summarize **where change happens most** (top 10 hot files) and what that implies about architecture boundaries.
2) Identify **risk hotspots**:
   - files with high churn
   - coupled files that should maybe be decoupled
3) Recommend **safe starting points** for a new contributor:
   - which areas look stable vs volatile
4) Produce **soft guidance**:
   - "If you touch X, review Y" rules
   - "This subsystem likely owns..." guesses (label as hypotheses)
5) Propose **3-5 follow-up questions** that would most reduce uncertainty.

## Output format
Return a single markdown document with sections:
- Executive summary
- Hotspots & churn analysis
- Coupling & change propagation
- Ownership / code stewardship
- Safe-change playbook (rules of thumb)
- Hypotheses (clearly labeled)
- Follow-up questions
