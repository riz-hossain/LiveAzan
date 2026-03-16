# ZKME Patch Planning Pack

**snapshot_digest**: `f9655f2963f29f6c21b555cb0f95e0b3a66b63ea`

Use this template BEFORE generating code with any LLM.
It forces a design-first workflow and aligns changes with ZKME artifacts.

## 1) Target
- Feature name (from `ZKME_FEATURE_REGISTRY.json`): 
- Entry point (route/CLI/job) to start from: 
- Bug / Feature request summary: 

## 2) Files to Touch (ranked + justification)
- `setup.py` — (why?)
- `apps\mobile\services\api.ts` — (why?)
- `scripts\enrich-iqama.ts` — (why?)
- `server\src\services\iqamaEnrichment.ts` — (why?)
- `packages\shared\src\types.ts` — (why?)
- `scripts\research-mosques.ts` — (why?)
- `apps\mobile\services\location.ts` — (why?)
- `packages\shared\src\constants.ts` — (why?)
- `apps\mobile\services\mawaqitService.ts` — (why?)
- `packages\shared\src\utils.ts` — (why?)
- `apps\mobile\services\azanAudio.ts` — (why?)
- `apps\mobile\services\iqamaDiscovery.ts` — (why?)
- `apps\mobile\android\app\src\main\java\com\liveaszan\app\MainApplication.kt` — (why?)
- `apps\mobile\services\notifications.ts` — (why?)
- `apps\mobile\services\overpassService.ts` — (why?)

## 3) Blast Radius (what could break)
- Consult `ZKME_CHANGE_IMPACT.json` for the target file(s)
- List dependent modules, shared utilities, config, schema impacts

## 4) Contracts & Invariants (must not violate)
- Consult `ZKME_CONTRACTS_INVARIANTS.json`
- List required validations/authz/state rules

## 5) Golden/Failure Paths (preserve behavior)
- Consult `ZKME_PATHS.json` for the entry point
- Note expected success flow + error/fallback behaviors

## 6) Tests
- Tests to update/add: 
- Tests to run: 

## 7) Known Hazards (read before editing)
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [MEDIUM] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [LOW] Catch block only logs to console - error may not be properly handled
- [LOW] Catch block only logs to console - error may not be properly handled
- [LOW] Catch block only logs to console - error may not be properly handled
- [LOW] Catch block only logs to console - error may not be properly handled
- [LOW] Catch block only logs to console - error may not be properly handled
- [MEDIUM] File apps\mobile\assets\data\mosques-index.json is 351,314 bytes

## 8) Patch Steps
1. 
2. 
3. 

## 9) Review Checklist
- [ ] Changes are limited to files justified by ZKME artifacts
- [ ] Contracts/invariants are preserved
- [ ] Error handling behavior preserved (failure paths)
- [ ] Tests updated/added and executed
