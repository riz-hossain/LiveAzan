# Codebase Context

## Architecture

- **156** source files, **0** test files
- Languages: json (68), typescript (59), unknown (18), xml (10), python (4), kotlin (4), markdown (3), gradle (3)
- 0 internal imports, 122 external dependencies

## Entry Points

### HTTP (71)
- GET `/api/admin/stats`
- GET `/api/iqama`
- GET `FRONTEND GET `${BASE_URL}${endpoint}``
- GET `FRONTEND GET url`
- GET `hasLiveStream` -> `False`
- GET `verified` -> `True`
- GET `/api/health`
- GET `/api/health`
- POST `/enrich-city`
- POST `/enrich-mosque/:id`
- GET `/iqama-coverage`
- POST `/run-refresh-job`
- GET `/refresh-logs`
- POST `/enrich-city`
- POST `/enrich-mosque/:id`
- ... +56 more

### UI (7)
- `/login`
- `/dashboard`
- `/mosques`
- `/mosques/:id/iqama`
- `/coverage-requests`
- `/stream-setup`
- `*`

## Data Models

### typescript (54)
- **Stats** (totalMosques, totalUsers, pendingRequests) `apps\admin\src\pages\Dashboard.tsx`
- **IqamaFormData** (fajr, dhuhr, asr, maghrib, isha, jummah...) `apps\admin\src\pages\IqamaEditor.tsx`
- **AzanPlayerProps** (mosqueId, prayer, hasLiveStream, streamUrl, onClose) `apps\mobile\components\AzanPlayer.tsx`
- **SourceResult** (label, status, count, error) `apps\mobile\components\DebugPanel.tsx`
- **Props** (lat, lon) `apps\mobile\components\DebugPanel.tsx`
- **IqamaCountdownProps** (prayerName, iqamaTime, mosqueName) `apps\mobile\components\IqamaCountdown.tsx`
- **MosqueCardProps** (mosque, onPress) `apps\mobile\components\MosqueCard.tsx`
- **MosqueMapProps** (mosques, userLocation, onMosquePress) `apps\mobile\components\MosqueMap.tsx`
- **NotificationSettingsProps** (prayerPrefs, onUpdate) `apps\mobile\components\NotificationSettings.tsx`
- **PrayerTimeCardProps** (prayerName, adhanTime, iqamaTime, isNext, onPress) `apps\mobile\components\PrayerTimeCard.tsx`
- **DiscoveredMosque** (discoveredIqama, iqamaSource, iqamaLastFetched) `apps\mobile\services\iqamaDiscovery.ts`
- **ScrapedMosqueData** (iqamaTimes, services, hours) `apps\mobile\services\iqamaDiscovery.ts`
- **LocalMosqueRecord** (id, name, type, address, city, province...) `apps\mobile\services\localMosqueSearch.ts`
- **MawaqitMosque** (uuid, name, label, type, latitude, longitude...) `apps\mobile\services\mawaqitService.ts`
- **IqamaTimes** (fajr, dhuhr, asr, maghrib, isha) `apps\mobile\services\mawaqitService.ts`
- ... +39 more

## Key Call Chains

545 resolved calls out of 2776 total.

- `handleLogout` -> `playAzan` -> `stopAzan`
- `handleRequestCoverage` -> `deduplicateMosques` -> `nameSimilarity`

## Configuration

### Constant (14)
- `PROJECT_LOCAL` (default: `liveaszan_local`) in `setup.py`
- `PROJECT_PROD` (default: `liveaszan_prod`) in `setup.py`
- `COMPOSE_CMD` (default: `None`) in `setup.py`
- `ADMIN_APP` in `setup.py`
- `MOBILE_APP` in `setup.py`
- `PID_FILE` (default: `.liveaszan_pids`) in `setup.py`
- `BRAND_GREEN` in `scripts\generate-mobile-assets.py`
- `WHITE` in `scripts\generate-mobile-assets.py`
- `LIGHT_GREEN` in `scripts\generate-mobile-assets.py`
- `ASSETS_DIR` in `scripts\generate-mobile-assets.py`
- `REPO` in `scripts\generate-mosque-bundle.py`
- `DATA_DIR` in `scripts\generate-mosque-bundle.py`
- `OUT_DIR` in `scripts\generate-mosque-bundle.py`
- `OUT_FILE` in `scripts\generate-mosque-bundle.py`

### Environment (14)
- `ANDROID_HOME` in `setup.py`
- `ANDROID_SDK_ROOT` in `setup.py`
- `LOCALAPPDATA` in `setup.py`
- `JAVA_HOME` in `setup.py`
- `API_URL` in `apps\admin\vite.config.ts`
- `EXPO_PUBLIC_API_URL` (default: `http://192.168.68.67:3001`) in `apps\mobile\.env`
- `EXPO_PUBLIC_API_URL` in `apps\mobile\services\api.ts`
- `ADMIN_EMAIL` in `server\prisma\seed.ts`
- `ADMIN_PASSWORD` in `server\prisma\seed.ts`
- `PORT` in `server\src\index.ts`
- `NODE_ENV` in `server\src\index.ts`
- `NODE_ENV` in `server\src\lib\prisma.ts`
- `JWT_SECRET` in `server\src\middleware\auth.ts`
- `JWT_SECRET` in `server\src\routes\auth.ts`

## File Dependencies

## Important Symbols

- [func] **info** `def info(msg)` `setup.py`
- [func] **haversineKm** `apps\mobile\services\iqamaDiscovery.ts`
- [func] **haversineKm** `apps\mobile\services\localMosqueSearch.ts`
- [func] **haversineKm** `apps\mobile\services\mawaqitService.ts`
- [func] **haversineKm** `scripts\enrich-iqama.ts`
- [func] **haversineKm** `server\src\services\iqamaEnrichment.ts`
- [func] **main** `def main()` `setup.py`
- [func] **main** `scripts\enrich-iqama.ts`
- [func] **main** `def main()` `scripts\generate-mobile-assets.py`
- [func] **main** `def main()` `scripts\generate-mosque-bundle.py`
- [func] **main** `scripts\research-mosques.ts`
- [func] **main** `server\prisma\seed.ts`
- [func] **getJwtSecret** `server\src\middleware\auth.ts`
- [func] **getJwtSecret** `server\src\routes\auth.ts`
- [func] **normalizeTime** `apps\mobile\services\mawaqitService.ts`
- [func] **normalizeTime** `scripts\research-mosques.ts`
- [func] **normalizeTime** `server\src\services\iqamaEnrichment.ts`
- [func] **is_windows** `def is_windows()` `setup.py`
- [func] **addMinutes** `apps\mobile\services\mawaqitService.ts`
- [func] **addMinutes** `scripts\research-mosques.ts`
- [func] **addMinutes** `server\src\services\iqamaEnrichment.ts`
- [func] **warn** `def warn(msg)` `setup.py`
- [type] **MawaqitMosque** `apps\mobile\services\mawaqitService.ts`
- [type] **IqamaTimes** `apps\mobile\services\mawaqitService.ts`
- [type] **IqamaTimes** `scripts\enrich-iqama.ts`
- [type] **MawaqitMosque** `scripts\enrich-iqama.ts`
- [type] **MawaqitMosque** `scripts\research-mosques.ts`
- [type] **IqamaTimes** `scripts\research-mosques.ts`
- [type] **MawaqitMosque** `server\src\services\iqamaEnrichment.ts`
- [type] **IqamaTimes** `server\src\services\iqamaEnrichment.ts`

## Hazards & Risks

### MEDIUM (17)
- [error_handling_gap] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [error_handling_gap] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [error_handling_gap] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [error_handling_gap] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [error_handling_gap] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [error_handling_gap] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [error_handling_gap] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [error_handling_gap] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [error_handling_gap] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- [error_handling_gap] Broad 'except Exception' with silent pass/expression - errors may be swallowed
- ... +7 more

## Features

### Setup.Py: Ask Yes No [medium]
Auto-inferred feature spanning 19 files (143 functions, 8 methods)
Symbols: 151
Key: `ask_yes_no`, `stop_admin`, `cmd_down`, `_chunk`, `parseHoursFromText`

### Mobile: Com Liveaszan [medium]
Auto-inferred feature spanning 1 files (2 methods)
Symbols: 4
Key: `ReactActivityDelegateWrapper`, `createReactActivityDelegate`, `getJSMainModuleName`, `getUseDeveloperSupport`

### Server: Fetch Prayer Times [medium]
Auto-inferred feature spanning 7 files (11 functions, 3 components)
Symbols: 14
Key: `fetchPrayerTimes`, `MosquesScreen`, `toRadians`, `saveLocation`, `requestPermissions`

### Mobile: Apps Mobile [medium]
Auto-inferred feature spanning 2 files (3 functions, 1 components)
Symbols: 4
Key: `AzanPlayer`, `playAzan`, `stopAzan`, `configureAudioSession`

### Mobile: Get Time Until Ms [medium]
Auto-inferred feature spanning 2 files (2 functions, 1 components)
Symbols: 3
Key: `getTimeUntilMs`, `IqamaCountdown`, `formatCountdown`

### Mobile Components [medium]
Directory-based feature group from apps\mobile\components (13 symbols)
Symbols: 15
Key: `AzanPlayerProps`, `DebugPanel`, `IqamaCountdownProps`, `LEAD_TIME_OPTIONS`, `MosqueCard`

### Mobile: Format Prayer Name [medium]
Auto-inferred feature spanning 2 files (6 functions)
Symbols: 6
Key: `formatPrayerName`, `parseTimeToDate`, `scheduleIqamaNotification`, `scheduleMaghribNotification`, `cancelAllNotifications`

### Scripts [medium]
Directory-based feature group from scripts (11 symbols)
Symbols: 11
Key: `Args`, `DATA_ROOT`, `EnrichedMosque`, `IqamaTimes`, `MawaqitMosque`

### Server [medium]
Auto-inferred feature spanning 2 files (4 functions)
Symbols: 4
Key: `getJwtSecret`, `authenticate`, `generateToken`, `optionalAuth`

### Admin: Src [low]
Directory-based feature group from apps\admin\src (5 symbols)
Symbols: 5
Key: `Login`, `MosqueList`, `CoverageRequests`, `AdminLayout`, `App`

### Admin: Pages [low]
Directory-based feature group from apps\admin\src\pages (5 symbols)
Symbols: 5
Key: `Stats`, `IqamaFormData`, `Dashboard`, `IqamaEditor`, `StreamSetup`

### Mobile: App [low]
Directory-based feature group from apps\mobile\android\app\src\main\java\com\liveaszan\app (7 symbols)
Symbols: 7
Key: `MainActivity`, `getMainComponentName`, `invokeDefaultOnBackPressed`, `MainApplication`, `getPackages`

### Mobile: (Tabs) [low]
Directory-based feature group from apps\mobile\app\(tabs) (4 symbols)
Symbols: 4
Key: `ViewMode`, `AZAN_SOUND_FILE`, `SettingsScreen`, `TabsLayout`

### Mobile: Services [low]
Directory-based feature group from apps\mobile\services (30 symbols)
Symbols: 30
Key: `followMosque`, `unfollowMosque`, `fetchCoverageRequests`, `isPlaying`, `AzanSoundId`

### Mobile: Stores [low]
Directory-based feature group from apps\mobile\stores (11 symbols)
Symbols: 11
Key: `AuthState`, `CachedIqama`, `MosqueState`, `PrayerState`, `SettingsState`


*Generated by KME v0.1.0 | 179 files analyzed*

