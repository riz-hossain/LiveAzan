# Repository Context

**Root**: `A:\git\LiveAzan`
**Scale**: 179 files, 355 symbols

## Entry Points (Start Here)

### HTTP
- **FRONTEND GET /api/admin/stats** `/api/admin/stats`
- **FRONTEND GET /api/iqama** `/api/iqama`
- **FRONTEND GET `${BASE_URL}${endpoint}`**
- **FRONTEND GET url**
- **GET /api/health** `/api/health`
- **GET /api/health** `/api/health`
- **POST /enrich-city** `/enrich-city`
- **POST /enrich-mosque/:id** `/enrich-mosque/:id`
- **GET /iqama-coverage** `/iqama-coverage`
- **POST /run-refresh-job** `/run-refresh-job`
- **GET /refresh-logs** `/refresh-logs`
- **POST /enrich-city** `/enrich-city`
- **POST /enrich-mosque/:id** `/enrich-mosque/:id`
- **GET /iqama-coverage** `/iqama-coverage`
- **POST /run-refresh-job** `/run-refresh-job`
- **GET /refresh-logs** `/refresh-logs`
- **POST /register** `/register`
- **POST /login** `/login`
- **POST /oauth** `/oauth`
- **POST /register** `/register`
- **POST /login** `/login`
- **POST /oauth** `/oauth`
- **POST /** `/`
- **GET /** `/`
- **PUT /:id** `/:id`
- **POST /** `/`
- **GET /** `/`
- **PUT /:id** `/:id`
- **GET /mosque/:mosqueId** `/mosque/:mosqueId`
- **POST /mosque/:mosqueId** `/mosque/:mosqueId`
- **PUT /:id** `/:id`
- **GET /mosque/:mosqueId** `/mosque/:mosqueId`
- **POST /mosque/:mosqueId** `/mosque/:mosqueId`
- **PUT /:id** `/:id`
- **GET /nearby** `/nearby`
- **GET /:id** `/:id`
- **POST /** `/`
- **PUT /:id** `/:id`
- **DELETE /:id** `/:id`
- **GET /nearby** `/nearby`
- **GET /:id** `/:id`
- **POST /** `/`
- **PUT /:id** `/:id`
- **DELETE /:id** `/:id`
- **GET /** `/`
- **GET /** `/`
- **POST /** `/`
- **GET /mine** `/mine`
- **GET /** `/`
- **PUT /:id/review** `/:id/review`
- ... and 19 more

## Key Source Files

- `distancecalculation-Labeeb.py` (0 symbols, python)
- `apps\admin\src\App.tsx` (5 symbols, typescript)
- `apps\admin\src\main.tsx` (0 symbols, typescript)
- `apps\admin\src\pages\Dashboard.tsx` (2 symbols, typescript)
- `apps\admin\src\pages\IqamaEditor.tsx` (2 symbols, typescript)
- `apps\admin\src\pages\StreamSetup.tsx` (1 symbols, typescript)
- `apps\mobile\metro.config.js` (0 symbols, javascript)
- `apps\mobile\app\_layout.tsx` (1 symbols, typescript)
- `apps\mobile\app\(auth)\login.tsx` (1 symbols, typescript)
- `apps\mobile\app\(auth)\register.tsx` (1 symbols, typescript)
- `apps\mobile\app\(auth)\_layout.tsx` (1 symbols, typescript)
- `apps\mobile\app\(tabs)\index.tsx` (1 symbols, typescript)
- `apps\mobile\app\(tabs)\mosques.tsx` (3 symbols, typescript)
- `apps\mobile\app\(tabs)\settings.tsx` (2 symbols, typescript)
- `apps\mobile\app\(tabs)\_layout.tsx` (1 symbols, typescript)
- `apps\mobile\app\mosque\[id].tsx` (2 symbols, typescript)
- `apps\mobile\components\AzanPlayer.tsx` (2 symbols, typescript)
- `apps\mobile\components\DebugPanel.tsx` (3 symbols, typescript)
- `apps\mobile\components\IqamaCountdown.tsx` (4 symbols, typescript)
- `apps\mobile\components\MosqueCard.tsx` (3 symbols, typescript)
- `apps\mobile\components\MosqueMap.tsx` (2 symbols, typescript)
- `apps\mobile\components\NotificationSettings.tsx` (3 symbols, typescript)
- `apps\mobile\components\PrayerTimeCard.tsx` (2 symbols, typescript)
- `apps\mobile\services\api.ts` (16 symbols, typescript)
- `apps\mobile\services\azanAudio.ts` (6 symbols, typescript)

## Database Touch Points

- `{'platform'}` (import)

## ⚠️ Critical Hazards

- **[MEDIUM]** Broad 'except Exception' with silent pass/expression - errors may be swallowed
  - Files: setup.py
- **[MEDIUM]** Broad 'except Exception' with silent pass/expression - errors may be swallowed
  - Files: setup.py
- **[MEDIUM]** Broad 'except Exception' with silent pass/expression - errors may be swallowed
  - Files: setup.py
- **[MEDIUM]** Broad 'except Exception' with silent pass/expression - errors may be swallowed
  - Files: setup.py
- **[MEDIUM]** Broad 'except Exception' with silent pass/expression - errors may be swallowed
  - Files: setup.py
- **[MEDIUM]** Broad 'except Exception' with silent pass/expression - errors may be swallowed
  - Files: setup.py
- **[MEDIUM]** Broad 'except Exception' with silent pass/expression - errors may be swallowed
  - Files: setup.py
- **[MEDIUM]** Broad 'except Exception' with silent pass/expression - errors may be swallowed
  - Files: setup.py
- **[MEDIUM]** Broad 'except Exception' with silent pass/expression - errors may be swallowed
  - Files: setup.py
- **[MEDIUM]** Broad 'except Exception' with silent pass/expression - errors may be swallowed
  - Files: setup.py

## Important Symbols

⚙️ `run` `def run(cmd, cwd, check, capture)` - Run command, return stdout. Raises RuntimeError on failure i...
⚙️ `run_visible` `def run_visible(cmd, cwd, check, env)` - Run command with output shown to user.
⚙️ `detect_compose` `def detect_compose()` - Detect docker compose v2 plugin or docker-compose v1 standal...
⚙️ `wait_docker` `def wait_docker(timeout_sec)` - Wait for Docker daemon; try to auto-start it.
⚙️ `ensure_env_local` `def ensure_env_local(repo)` - Create .env.local from example if missing.
⚙️ `ensure_env_prod` `def ensure_env_prod(repo)` - Ensure .env.prod exists for production.
⚙️ `start_admin` `def start_admin(repo)` - Start the Vite dev server as a background process.
⚙️ `ensure_mobile_env` `def ensure_mobile_env(repo)` - Write apps/mobile/.env with the machine's LAN IP for Expo de...
⚙️ `generate_mosque_bundle` `def generate_mosque_bundle(repo)` - Merge /data/mosques/**/*.json into the mobile app's bundled ...
⚙️ `cmd_android` `def cmd_android(repo, fresh, nuke_gradle)` - Build Android APK for the mobile app.
📦 `MainActivity` 
📦 `MainApplication` 
📦 `ReactSettingsPlugin` 
⚙️ `slugify` `def slugify(text: str) -> str` - Lowercase, replace spaces/special chars with underscores.
⚙️ `is_valid_time` `def is_valid_time(t: str) -> bool` - Returns True if t looks like HH:mm (not 'sunset+X' etc.).
⚙️ `build_iqama_times` `def build_iqama_times(raw: dict) -> dict` - Filter iqamaTimes to only include valid HH:mm entries.
⚙️ `process_file` `def process_file(json_file: Path) -> list` - Read one city JSON file and return a list of flattened mosqu...
⚙️ `is_windows` `def is_windows()`
⚙️ `is_mac` `def is_mac()`
⚙️ `has_cmd` `def has_cmd(name)`
⚙️ `die` `def die(msg, code)`
⚙️ `info` `def info(msg)`
⚙️ `warn` `def warn(msg)`
⚙️ `header` `def header(msg)`
⚙️ `ask_yes_no` `def ask_yes_no(prompt, default)`
⚙️ `docker_running` `def docker_running()`
⚙️ `windows_check_virtualization` `def windows_check_virtualization()`
⚙️ `windows_check_docker_backend` `def windows_check_docker_backend()`
⚙️ `compose_local` `def compose_local(repo)`
⚙️ `compose_prod` `def compose_prod(repo)`
⚙️ `get_compose_prefix` `def get_compose_prefix(repo, mode)`
⚙️ `compose_up` `def compose_up(repo, mode)`
⚙️ `compose_down` `def compose_down(repo, mode, wipe_volumes)`
⚙️ `compose_status` `def compose_status(repo, mode)`
⚙️ `stop_admin` `def stop_admin(repo, quiet)`
⚙️ `admin_status` `def admin_status(repo)`
⚙️ `cmd_generate_data` `def cmd_generate_data(repo)`
⚙️ `print_admin_credentials` `def print_admin_credentials(repo, mode)`
⚙️ `cmd_up` `def cmd_up(repo, mode)`
⚙️ `cmd_restart` `def cmd_restart(repo, mode)`
⚙️ `cmd_down` `def cmd_down(repo)`
⚙️ `cmd_clean` `def cmd_clean(repo)`
⚙️ `cmd_status` `def cmd_status(repo)`
⚙️ `show_help` `def show_help()`
⚙️ `main` `def main()`
⚙️ `deduplicateMosques` 
⚙️ `staleness` 
⚙️ `getTimeUntilMs` 
⚙️ `formatCountdown` 
⚙️ `getSourceInfo` 
⚙️ `loginApi` 
⚙️ `registerApi` 
⚙️ `oauthLoginApi` 
⚙️ `fetchMosquesNearby` 
⚙️ `fetchMosqueById` 
⚙️ `fetchIqama` 
⚙️ `followMosque` 
⚙️ `unfollowMosque` 
⚙️ `fetchPrayerTimesApi` 
⚙️ `updateProfile` 
⚙️ `fetchPrayerPrefs` 
⚙️ `updatePrayerPrefs` 
⚙️ `requestCoverage` 
⚙️ `fetchCoverageRequests` 
⚙️ `configureAudioSession` 
⚙️ `playAzan` 
⚙️ `stopAzan` 
⚙️ `isPlaying` 
⚙️ `getCachedTimestamp` 
⚙️ `clearCached` 
⚙️ `discoverNearbyIqama` 
⚙️ `refreshSingleMosqueIqama` 
⚙️ `scrapeWebsiteIqama` 
⚙️ `parseIqamaFromText` 
⚙️ `parseServicesFromText` 
⚙️ `parseHoursFromText` 
⚙️ `mapOverpassToDiscovered` 
⚙️ `haversineKm` 
⚙️ `cacheIqama` 
⚙️ `iqamaTimesToSchedules` 
⚙️ `searchLocalMosques` 
⚙️ `haversineKm` 
⚙️ `getSavedLocation` 
⚙️ `saveLocation` 
⚙️ `requestPermissions` 
⚙️ `requestBackgroundPermissions` 
⚙️ `getCurrentLocation` 
⚙️ `startBackgroundTracking` 
⚙️ `stopBackgroundTracking` 
⚙️ `haversineDistance` 
⚙️ `toRadians` 
⚙️ `searchNearby` 
⚙️ `getByUuid` 
⚙️ `findBestMatch` 
⚙️ `extractIqamaTimes` 
⚙️ `haversineKm` 
⚙️ `jaccardSimilarity` 
⚙️ `isValidTime` 
⚙️ `normalizeTime` 
⚙️ `addMinutes` 
⚙️ `requestPermissions` 
⚙️ `parseTimeToDate` 
⚙️ `scheduleIqamaNotification` 
⚙️ `scheduleMaghribNotification` 
⚙️ `cancelAllNotifications` 
⚙️ `rescheduleAll` 
⚙️ `formatPrayerName` 
⚙️ `searchOverpassMosques` 
⚙️ `parseElement` 
⚙️ `getCacheKey` 
⚙️ `getFromCache` 
⚙️ `setCache` 
⚙️ `getPrayerTimes` 
⚙️ `getNextPrayer` 
⚙️ `parseTime` 
⚙️ `formatTime` 
⚙️ `formatTime12h` 
⚙️ `getNextPrayer` 
⚙️ `haversineDistance` 
⚙️ `toRad` 
⚙️ `formatCountdown` 
⚙️ `isMaghrib` 
⚙️ `getTodayForAladhan` 
⚙️ `getTodayISO` 
⚙️ `parseArgs` 
⚙️ `findSeedFile` 
⚙️ `findAllSeedFiles` 
⚙️ `mawaqitSearch` 
⚙️ `mawaqitFetch` 
⚙️ `bestMatch` 
⚙️ `extractIqama` 
⚙️ `scrapeWebsite` 
⚙️ `parseIqama` 
⚙️ `enrichSeedFile` 
⚙️ `addSource` 
⚙️ `main` 
⚙️ `haversineKm` 
⚙️ `jaccard` 
⚙️ `normTime` 
⚙️ `addMins` 
⚙️ `sleep` 
⚙️ `main` `def main()`
⚙️ `main` `def main()`
⚙️ `parseArgs` 
⚙️ `searchOverpassAPI` 
⚙️ `searchMawaqitNearby` 
⚙️ `fetchMawaqitById` 
⚙️ `findMawaqitMatch` 
⚙️ `extractIqamaFromMawaqit` 
⚙️ `deduplicateMosques` 
⚙️ `nameSimilarity` 
⚙️ `haversine` 
⚙️ `normalizeTime` 
⚙️ `addMinutes` 
⚙️ `generateSeedFile` 
⚙️ `main` 
⚙️ `findJsonFiles` 
⚙️ `regionKey` 
⚙️ `toPrayerEnum` 
⚙️ `main` 
⚙️ `runIqamaRefreshJob` 
⚙️ `startIqamaRefreshJob` 
⚙️ `getJwtSecret` 
⚙️ `authenticate` 
⚙️ `optionalAuth` 
⚙️ `requireRole` 
⚙️ `getJwtSecret` 
⚙️ `generateToken` 
⚙️ `fetchPrayerTimes` 
⚙️ `formatDate` 
⚙️ `enrichMosque` 
⚙️ `enrichCity` 
⚙️ `getActiveCities` 
⚙️ `tryMawaqit` 
⚙️ `mawaqitSearchNearby` 
⚙️ `mawaqitGetByUuid` 
⚙️ `mawaqitFindBestMatch` 
⚙️ `extractIqamaTimes` 
⚙️ `scrapeWebsiteIqama` 
⚙️ `parseIqamaFromText` 
⚙️ `upsertIqama` 
⚙️ `haversineKm` 
⚙️ `jaccardSimilarity` 
⚙️ `normalizeTime` 
⚙️ `addMinutes` 
⚙️ `sleep` 
⚙️ `scheduleIqamaNotification` 
⚙️ `cancelUserNotifications` 
⚙️ `getStreamStatus` 
⚙️ `useAuthStore` 
⚙️ `useMosqueStore` 
⚙️ `usePrayerStore` 
⚙️ `useSettingsStore` 
• `Login` 
• `MosqueList` 
• `CoverageRequests` 
• `AdminLayout` 
• `Stats` 
• `IqamaFormData` 
🔧 `onCreate` 
🔧 `setTheme` 
🔧 `getMainComponentName` 
🔧 `createReactActivityDelegate` 
🔧 `ReactActivityDelegateWrapper` 
🔧 `invokeDefaultOnBackPressed` 
🔧 `getPackages` 
🔧 `PackageList` 
🔧 `getJSMainModuleName` 
🔧 `getUseDeveloperSupport` 
🔧 `get` 
🔧 `onCreate` 
🔧 `load` 
🔧 `onConfigurationChanged` 
🔧 `kotlin` 
🔧 `id` 
🔧 `mavenCentral` 
🔧 `create` 
🔧 `apply` 
• `ViewMode` 
• `AzanPlayer` 
• `AzanPlayerProps` 
• `DebugPanel` 
• `SourceResult` 
• `Props` 
• `IqamaCountdown` 
• `IqamaCountdownProps` 
• `MosqueCard` 
• `MosqueCardProps` 
• `MosqueMap` 
• `MosqueMapProps` 
• `NotificationSettings` 
• `NotificationSettingsProps` 
• `PrayerTimeCard` 
• `PrayerTimeCardProps` 
• `AzanSoundId` 
• `CacheEntry` 
• `DiscoveredMosque` 
• `ScrapedMosqueData` 
• `LocalMosqueRecord` 
• `MawaqitMosque` 
• `IqamaTimes` 
• `OverpassMosque` 
• `CacheEntry` 
• `AuthState` 
• `CachedIqama` 
• `MosqueState` 
• `PrayerState` 
• `SettingsState` 
• `PrayerTimes` 
• `NextPrayer` 
• `Mosque` 
• `IqamaSchedule` 
• `User` 
• `UserPrayerPreference` 
• `UserMosque` 
• `CoverageRequest` 
• `AuthTokenPayload` 
• `LoginResponse` 
• `RegisterRequest` 
• `MosqueSeedFile` 
• `MosqueSeedEntry` 
• `NearbyMosquesResponse` 
• `ApiError` 
• `SeedMosque` 
• `SeedFile` 
• `IqamaTimes` 
• `MawaqitMosque` 
• `Args` 
• `Args` 
• `RawMosque` 
• `MawaqitMosque` 
• `IqamaTimes` 
• `EnrichedMosque` 
• `MosqueSeedEntry` 
• `MosqueSeedFile` 
• `PrayerTimes` 
• `MawaqitMosque` 
• `IqamaTimes` 
• `EnrichmentResult` 
• `EnrichmentReport` 
• `StreamStatus` 
• `App` 
• `Dashboard` 
• `IqamaEditor` 
• `StreamSetup` 
• `RootLayout` 
• `LoginScreen` 
• `RegisterScreen` 
• `AuthLayout` 
• `HomeScreen` 
• `MosquesScreen` 
• `AZAN_SOUND_FILE` 
• `SettingsScreen` 
• `TabsLayout` 
• `MosqueDetailScreen` 
• `LEAD_TIME_OPTIONS` 
• `BASE_URL` 
• `TOKEN_KEY` 
• `AZAN_SOUNDS` 
• `NEARBY_MOSQUE_TTL` 
• `IQAMA_TTL` 
• `MOSQUE_DETAIL_TTL` 
• `TRAVEL_THRESHOLD_KM` 
• `SAVED_LOCATION_KEY` 
• `BACKGROUND_TASK_NAME` 
• `MAWAQIT_BASE` 
• `OVERPASS_URL` 
• `CACHE_DURATION_MS` 
• `USER_KEY` 
• `GUEST_KEY` 
• `CALC_METHODS` 
• `DEFAULT_CALC_METHOD` 
• `DEFAULT_LEAD_MINUTES` 
• `MIN_LEAD_MINUTES` 
• `MAX_LEAD_MINUTES` 
• `DEFAULT_SEARCH_RADIUS_KM` 
• `TRAVEL_DETECTION_THRESHOLD_KM` 
• `TRAVEL_DETECTION_COOLDOWN_MS` 
• `ALADHAN_API_BASE` 
• `PRAYER_TIMES_CACHE_HOURS` 
• `MOSQUE_CACHE_HOURS` 
• `DATA_ROOT` 
• `PORT` 
• `STALE_DAYS` 
• `RATE_LIMIT_MS` 
⚙️ `_check_android_prerequisites` `def _check_android_prerequisites()` - Upfront checks for Node, npm, Java, and Android SDK before a...
⚙️ `_patch_expo_modules_core_gradle` `def _patch_expo_modules_core_gradle(app_dir)` - Fix MissingPropertyException for 'components.release' in Exp...
⚙️ `_patch_gradle_wrapper` `def _patch_gradle_wrapper(android_dir)` - Pin Gradle wrapper to exactly 8.7.
- Gradle â‰¤8.6 ships wit...
⚙️ `_patch_ndk_version` `def _patch_ndk_version(android_dir)` - On Windows, downgrade NDK 26.1.10909125 â†’ 25.1.8937393.

N...
⚙️ `_preflight_check_settings_gradle` `def _preflight_check_settings_gradle(android_dir)` - Scan settings.gradle for includeBuild entries and verify eac...
⚙️ `_ensure_cleartext_traffic` `def _ensure_cleartext_traffic(app_dir)` - Patch AndroidManifest.xml to allow plain HTTP for local dev.
⚙️ `_read_env_value` `def _read_env_value(env_file, key)` - Read a single key from a .env file.
⚙️ `_make_png` `def _make_png(width: int, height: int, pixels) -> bytes` - Generate a minimal valid RGBA PNG.
pixels: callable(x, y) ->...
⚙️ `_icon_pixel` `def _icon_pixel(x: int, y: int, size: int)` - Brand-green background, white crescent + dot.
⚙️ `_splash_pixel` `def _splash_pixel(x: int, y: int, size: int)` - Brand-green fill with a centred white crescent (larger).
⚙️ `_check_hyperv_virtualization` `def _check_hyperv_virtualization()`
⚙️ `_ensure_wsl2_features` `def _ensure_wsl2_features()`
⚙️ `_check_wsl_installed` `def _check_wsl_installed()`
⚙️ `_pid_file` `def _pid_file(repo)`
⚙️ `_is_process_running` `def _is_process_running(pid)`
⚙️ `_get_local_ip` `def _get_local_ip()`
⚙️ `_stop_gradle_daemons` `def _stop_gradle_daemons(android_dir)`
⚙️ `_clean_gradle_caches` `def _clean_gradle_caches(android_dir, nuke_global)`
⚙️ `_ensure_mobile_deps` `def _ensure_mobile_deps(app_dir, fresh)`
⚙️ `_ensure_expo_prebuild` `def _ensure_expo_prebuild(app_dir, clean)`
⚙️ `_clean_stale_outputs` `def _clean_stale_outputs(app_dir)`
⚙️ `_find_apk` `def _find_apk(outputs_dir)`
⚙️ `_java_major_from` `def _java_major_from(java_exe)`
⚙️ `_detect_agp_version` `def _detect_agp_version(android_dir)`
⚙️ `_select_jdk_for_android` `def _select_jdk_for_android(android_dir)`
⚙️ `_run_streaming` `def _run_streaming(cmd, cwd, env)`
⚙️ `_gradle_build_with_retry` `def _gradle_build_with_retry(android_dir, base_cmd, env)`
⚙️ `_chunk` `def _chunk(name: bytes, data: bytes) -> bytes`
⚙️ `_in_circle` 
⚙️ `_make_silent_wav` 

## Development Guidelines

When modifying code:
1. **Check Entry Points** above for API contract changes
2. **Verify Data Models** for schema changes
3. **Review Database Touch Points** for query changes
4. **Avoid Critical Hazards** listed above
5. **Follow patterns** in Key Source Files

---
*Generated by KME v0.1.0 | 179 files analyzed*
