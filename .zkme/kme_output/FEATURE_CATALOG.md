# Feature Catalog

## Setup.Py: Ask Yes No [medium]

Auto-inferred feature spanning 19 files (143 functions, 8 methods)

**Symbols:**
- `ask_yes_no`
- `stop_admin`
- `cmd_down`
- `_chunk`
- `parseHoursFromText`
- `upsertIqama`
- `process_file`
- `enrichSeedFile`
- `windows_check_docker_backend`
- `setCache`
- `load`
- `_clean_stale_outputs`
- `_make_png`
- `_stop_gradle_daemons`
- `_patch_ndk_version`
- `warn`
- `addMinutes`
- `getCacheKey`
- `print_admin_credentials`
- `registerApi`
- `searchOverpassMosques`
- `regionKey`
- `id`
- `_is_process_running`
- `cacheIqama`
- `run_visible`
- `haversine`
- `_make_silent_wav`
- `fetchPrayerPrefs`
- `fetchMosqueById`
- `refreshSingleMosqueIqama`
- `oauthLoginApi`
- `has_cmd`
- `is_mac`
- `searchNearby`
- `cmd_status`
- `getByUuid`
- `updateProfile`
- `die`
- `show_help`
- `fetchMosquesNearby`
- `bestMatch`
- `updatePrayerPrefs`
- `findMawaqitMatch`
- `main`
- `_check_wsl_installed`
- `haversineKm`
- `deduplicateMosques`
- `_ensure_wsl2_features`
- `header`
- `mawaqitGetByUuid`
- `_select_jdk_for_android`
- `normTime`
- `parseIqama`
- `admin_status`
- `parseTime`
- `_ensure_expo_prebuild`
- `wait_docker`
- `slugify`
- `requestCoverage`
- `fetchIqama`
- `normalizeTime`
- `is_valid_time`
- `docker_running`
- `_patch_gradle_wrapper`
- `findBestMatch`
- `compose_local`
- `parseIqamaFromText`
- `ensure_env_prod`
- `findSeedFile`
- `extractIqama`
- `cmd_android`
- `_java_major_from`
- `enrichCity`
- `findAllSeedFiles`
- `mawaqitSearchNearby`
- `mavenCentral`
- `cmd_up`
- `toPrayerEnum`
- `getNextPrayer`
- `generate_mosque_bundle`
- `_pid_file`
- `iqamaTimesToSchedules`
- `requireRole`
- `_detect_agp_version`
- `fetchMawaqitById`
- `cmd_restart`
- `generateSeedFile`
- `nameSimilarity`
- `_find_apk`
- `startIqamaRefreshJob`
- `loginApi`
- `run`
- `start_admin`
- `_ensure_mobile_deps`
- `cmd_clean`
- `parseServicesFromText`
- `mawaqitFetch`
- `ensure_env_local`
- `compose_up`
- `extractIqamaFromMawaqit`
- `discoverNearbyIqama`
- `get_compose_prefix`
- `jaccardSimilarity`
- `_get_local_ip`
- `getActiveCities`
- `is_windows`
- `compose_prod`
- `_preflight_check_settings_gradle`
- `parseArgs`
- `addSource`
- `searchLocalMosques`
- `cmd_generate_data`
- `tryMawaqit`
- `mawaqitFindBestMatch`
- `info`
- `_check_hyperv_virtualization`
- `runIqamaRefreshJob`
- `extractIqamaTimes`
- `searchMawaqitNearby`
- `scrapeWebsiteIqama`
- `_check_android_prerequisites`
- `compose_status`
- `jaccard`
- `compose_down`
- `ensure_mobile_env`
- `detect_compose`
- `_clean_gradle_caches`
- `kotlin`
- `create`
- `addMins`
- `isValidTime`
- `_patch_expo_modules_core_gradle`
- `getPrayerTimes`
- `sleep`
- `_gradle_build_with_retry`
- `searchOverpassAPI`
- `findJsonFiles`
- `getFromCache`
- `setTheme`
- `get`
- `scrapeWebsite`
- `_run_streaming`
- `windows_check_virtualization`
- `fetchPrayerTimesApi`
- `mawaqitSearch`
- `_ensure_cleartext_traffic`
- `onCreate`
- `enrichMosque`
- `_read_env_value`
- `build_iqama_times`

**Evidence:**
- `setup.py:116`
- `setup.py:500`
- `setup.py:1204`
- `scripts\generate-mobile-assets.py:27`
- `apps\mobile\services\iqamaDiscovery.ts:399`

## Mobile: Com Liveaszan [medium]

Auto-inferred feature spanning 1 files (2 methods)

**Symbols:**
- `ReactActivityDelegateWrapper`
- `createReactActivityDelegate`
- `getJSMainModuleName`
- `getUseDeveloperSupport`

**Evidence:**
- `apps\mobile\android\app\src\main\java\com\liveaszan\app\MainActivity.kt:33`
- `apps\mobile\android\app\src\main\java\com\liveaszan\app\MainActivity.kt:32`
- `apps\mobile\android\app\src\main\java\com\liveaszan\app\MainApplication.kt:28`
- `apps\mobile\android\app\src\main\java\com\liveaszan\app\MainApplication.kt:30`

## Server: Fetch Prayer Times [medium]

Auto-inferred feature spanning 7 files (11 functions, 3 components)

**Symbols:**
- `fetchPrayerTimes`
- `MosquesScreen`
- `toRadians`
- `saveLocation`
- `requestPermissions`
- `requestBackgroundPermissions`
- `getCurrentLocation`
- `formatDate`
- `startBackgroundTracking`
- `toRad`
- `getSavedLocation`
- `MosqueDetailScreen`
- `HomeScreen`
- `haversineDistance`

**Evidence:**
- `server\src\services\aladhanService.ts:11`
- `apps\mobile\app\(tabs)\mosques.tsx:34`
- `apps\mobile\services\location.ts:169`
- `apps\mobile\services\location.ts:23`
- `apps\mobile\services\notifications.ts:21`

## Mobile: Apps Mobile [medium]

Auto-inferred feature spanning 2 files (3 functions, 1 components)

**Symbols:**
- `AzanPlayer`
- `playAzan`
- `stopAzan`
- `configureAudioSession`

**Evidence:**
- `apps\mobile\components\AzanPlayer.tsx:14`
- `apps\mobile\services\azanAudio.ts:45`
- `apps\mobile\services\azanAudio.ts:79`
- `apps\mobile\services\azanAudio.ts:33`

## Mobile: Get Time Until Ms [medium]

Auto-inferred feature spanning 2 files (2 functions, 1 components)

**Symbols:**
- `getTimeUntilMs`
- `IqamaCountdown`
- `formatCountdown`

**Evidence:**
- `apps\mobile\components\IqamaCountdown.tsx:10`
- `apps\mobile\components\IqamaCountdown.tsx:38`
- `packages\shared\src\utils.ts:98`

## Mobile Components [medium]

Directory-based feature group from apps\mobile\components (13 symbols)

**Symbols:**
- `AzanPlayerProps`
- `DebugPanel`
- `IqamaCountdownProps`
- `LEAD_TIME_OPTIONS`
- `MosqueCard`
- `MosqueCardProps`
- `MosqueMap`
- `MosqueMapProps`
- `NotificationSettings`
- `NotificationSettingsProps`
- `PrayerTimeCard`
- `PrayerTimeCardProps`
- `Props`
- `SourceResult`
- `getSourceInfo`

**Evidence:**
- `apps\mobile\components\MosqueCard.tsx:11`
- `apps\mobile\components\MosqueCard.tsx:20`
- `apps\mobile\components\AzanPlayer.tsx`

## Mobile: Format Prayer Name [medium]

Auto-inferred feature spanning 2 files (6 functions)

**Symbols:**
- `formatPrayerName`
- `parseTimeToDate`
- `scheduleIqamaNotification`
- `scheduleMaghribNotification`
- `cancelAllNotifications`
- `rescheduleAll`

**Evidence:**
- `apps\mobile\services\notifications.ts:186`
- `apps\mobile\services\notifications.ts:33`
- `server\src\services\notificationService.ts:3`
- `apps\mobile\services\notifications.ts:98`
- `apps\mobile\services\notifications.ts:150`

## Scripts [medium]

Directory-based feature group from scripts (11 symbols)

**Symbols:**
- `Args`
- `DATA_ROOT`
- `EnrichedMosque`
- `IqamaTimes`
- `MawaqitMosque`
- `RawMosque`
- `SeedFile`
- `SeedMosque`
- `_icon_pixel`
- `_in_circle`
- `_splash_pixel`

**Evidence:**
- `scripts\generate-mobile-assets.py:61`
- `scripts\generate-mobile-assets.py:88`
- `scripts\generate-mobile-assets.py:64`
- `scripts\enrich-iqama.ts`

## Server [medium]

Auto-inferred feature spanning 2 files (4 functions)

**Symbols:**
- `getJwtSecret`
- `authenticate`
- `generateToken`
- `optionalAuth`

**Evidence:**
- `server\src\routes\auth.ts:9`
- `server\src\middleware\auth.ts:24`
- `server\src\routes\auth.ts:17`
- `server\src\middleware\auth.ts:54`

## Admin: Src [low]

Directory-based feature group from apps\admin\src (5 symbols)

**Symbols:**
- `Login`
- `MosqueList`
- `CoverageRequests`
- `AdminLayout`
- `App`

**Evidence:**
- `apps\admin\src\App.tsx`

## Admin: Pages [low]

Directory-based feature group from apps\admin\src\pages (5 symbols)

**Symbols:**
- `Stats`
- `IqamaFormData`
- `Dashboard`
- `IqamaEditor`
- `StreamSetup`

**Evidence:**
- `apps\admin\src\pages\Dashboard.tsx`

## Mobile: App [low]

Directory-based feature group from apps\mobile\android\app\src\main\java\com\liveaszan\app (7 symbols)

**Symbols:**
- `MainActivity`
- `getMainComponentName`
- `invokeDefaultOnBackPressed`
- `MainApplication`
- `getPackages`
- `PackageList`
- `onConfigurationChanged`

**Evidence:**
- `apps\mobile\android\app\src\main\java\com\liveaszan\app\MainActivity.kt`

## Mobile: (Tabs) [low]

Directory-based feature group from apps\mobile\app\(tabs) (4 symbols)

**Symbols:**
- `ViewMode`
- `AZAN_SOUND_FILE`
- `SettingsScreen`
- `TabsLayout`

**Evidence:**
- `apps\mobile\app\(tabs)\mosques.tsx`

## Mobile: Services [low]

Directory-based feature group from apps\mobile\services (30 symbols)

**Symbols:**
- `followMosque`
- `unfollowMosque`
- `fetchCoverageRequests`
- `isPlaying`
- `AzanSoundId`
- `getCachedTimestamp`
- `clearCached`
- `CacheEntry`
- `mapOverpassToDiscovered`
- `DiscoveredMosque`
- `ScrapedMosqueData`
- `LocalMosqueRecord`
- `stopBackgroundTracking`
- `MawaqitMosque`
- `IqamaTimes`
- `parseElement`
- `OverpassMosque`
- `CacheEntry`
- `BASE_URL`
- `TOKEN_KEY`
- `AZAN_SOUNDS`
- `NEARBY_MOSQUE_TTL`
- `IQAMA_TTL`
- `MOSQUE_DETAIL_TTL`
- `TRAVEL_THRESHOLD_KM`
- `SAVED_LOCATION_KEY`
- `BACKGROUND_TASK_NAME`
- `MAWAQIT_BASE`
- `OVERPASS_URL`
- `CACHE_DURATION_MS`

**Evidence:**
- `apps\mobile\services\api.ts`

## Mobile: Stores [low]

Directory-based feature group from apps\mobile\stores (11 symbols)

**Symbols:**
- `AuthState`
- `CachedIqama`
- `MosqueState`
- `PrayerState`
- `SettingsState`
- `USER_KEY`
- `GUEST_KEY`
- `useAuthStore`
- `useMosqueStore`
- `usePrayerStore`
- `useSettingsStore`

**Evidence:**
- `apps\mobile\stores\authStore.ts`

## Shared: Src [low]

Directory-based feature group from packages\shared\src (31 symbols)

**Symbols:**
- `PrayerTimes`
- `NextPrayer`
- `Mosque`
- `IqamaSchedule`
- `User`
- `UserPrayerPreference`
- `UserMosque`
- `CoverageRequest`
- `AuthTokenPayload`
- `LoginResponse`
- `RegisterRequest`
- `MosqueSeedFile`
- `MosqueSeedEntry`
- `NearbyMosquesResponse`
- `ApiError`
- `formatTime`
- `formatTime12h`
- `isMaghrib`
- `getTodayForAladhan`
- `getTodayISO`
- `CALC_METHODS`
- `DEFAULT_CALC_METHOD`
- `DEFAULT_LEAD_MINUTES`
- `MIN_LEAD_MINUTES`
- `MAX_LEAD_MINUTES`
- `DEFAULT_SEARCH_RADIUS_KM`
- `TRAVEL_DETECTION_THRESHOLD_KM`
- `TRAVEL_DETECTION_COOLDOWN_MS`
- `ALADHAN_API_BASE`
- `PRAYER_TIMES_CACHE_HOURS`
- `MOSQUE_CACHE_HOURS`

**Evidence:**
- `packages\shared\src\types.ts`

## Server: Services [low]

Directory-based feature group from server\src\services (10 symbols)

**Symbols:**
- `PrayerTimes`
- `MawaqitMosque`
- `IqamaTimes`
- `EnrichmentResult`
- `EnrichmentReport`
- `cancelUserNotifications`
- `getStreamStatus`
- `StreamStatus`
- `STALE_DAYS`
- `RATE_LIMIT_MS`

**Evidence:**
- `server\src\services\aladhanService.ts`

## Mobile: (Auth) [low]

Directory-based feature group from apps\mobile\app\(auth) (3 symbols)

**Symbols:**
- `LoginScreen`
- `RegisterScreen`
- `AuthLayout`

**Evidence:**
- `apps\mobile\app\(auth)\login.tsx`

