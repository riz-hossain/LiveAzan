# LiveAzan — Usability Design Plan

## Context

LiveAzan is a **mosque-centric** prayer application. The repo is currently empty (just a README and a placeholder Python file). The goal is to design and build a usable product from scratch that connects Muslim communities to their **local masjids** by:

- Collecting **iqama times** (actual prayer start times) from local mosques
- Playing **live azan** streamed from partner mosques (fallback to recorded azan)
- Alerting users **10-15 minutes before iqama** (not adhan time)
- Working on **both mobile and desktop**
- Using **Aladhan API + offline fallback** for prayer times

This is NOT another generic prayer times app. The differentiator is **mosque-first**: iqama integration, live streaming from real mosques, and community-focused features.

---

## Iqama Data Sourcing Strategy (Critical)

The hardest problem in this app is **getting real iqama times from mosques**. Here's what I found for Waterloo, ON as a proof-of-concept:

### Live Extraction Results — Waterloo, Ontario (March 15, 2026)

**Source 1: Aladhan API** — Prayer start times (adhan times, NOT iqama):
| Prayer | Adhan Time |
|--------|-----------|
| Fajr | 6:16 AM |
| Dhuhr | 1:31 PM |
| Asr | 4:49 PM |
| Maghrib | 7:28 PM |
| Isha | 8:47 PM |

**Source 2: Masjidbox (MAC Waterloo)** — Real iqama times:
| Prayer | Adhan | Iqama |
|--------|-------|-------|
| Fajr | 6:16 AM | 6:36 AM |
| Dhuhr | 1:32 PM | **1:45 PM** |
| Asr | 5:41 PM | **6:00 PM** |
| Maghrib | 7:29 PM | **7:33 PM** |
| Isha | 8:48 PM | **9:00 PM** |
| Jumuah | 1:30 PM | **1:50 PM** |

**Source 3: PrayersConnect (Waterloo Masjid)** — Real iqama times:
| Prayer | Adhan | Iqama |
|--------|-------|-------|
| Fajr | 6:16 AM | 6:16 AM |
| Dhuhr | 1:31 PM | **1:45 PM** |
| Asr | 4:50 PM | **6:00 PM** |
| Maghrib | 7:30 PM | **7:30 PM** |
| Isha | 8:47 PM | **9:10 PM** |

**Key insight**: Iqama differs from adhan by 5-70 minutes depending on prayer and mosque. Notice Asr iqama is 6:00 PM at both mosques, but adhan is ~5 PM — a full hour gap. This proves why iqama-based notifications are essential.

### Data Extraction Approaches (Ranked)

1. **Web scraping existing platforms** (bootstrap data):
   - Scrape [masjidbox.com](https://masjidbox.com) — structured HTML, easy to parse
   - Scrape [prayersconnect.com](https://prayersconnect.com) — has mosque pages with iqama
   - Use as seed data until mosques self-manage via admin portal

2. **Third-party APIs** (where available):
   - **MAWAQIT** (`mawaqit.net`) — 8,000+ mosques, has Python SDK (`pip install mawaqit`), iqama offsets included. Free (waqf), non-commercial use
   - **MasjidiAPI** (`api.masjidiapp.com`) — open API for iqama times (currently appears down/unreliable)
   - **PrayersConnect** — has an API (GitHub repo exists), but documentation is sparse

3. **Mosque admin self-service** (long-term):
   - Build admin portal for mosque admins to input/update iqama times
   - This is the sustainable model — mosques maintain their own data
   - Offer easy SMS/WhatsApp-based updates for non-tech-savvy admins

4. **Community crowdsourcing** (supplement):
   - Let users submit iqama times for their mosque
   - Require verification (photo of iqama board, multiple users confirming)

### Recommended Approach
- **Phase 1**: Scrape masjidbox.com + prayersconnect.com for seed data
- **Phase 2**: Integrate MAWAQIT Python SDK for 8,000+ mosques
- **Phase 3**: Build admin portal for mosque self-management
- **Phase 4**: Add crowdsourcing as fallback

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  React Native (Expo) — iOS, Android, Web         │
│  Single codebase → mobile apps + web/desktop     │
└──────────────────────┬──────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────┐
│                   Backend                        │
│  Node.js + Express + TypeScript                  │
│  - REST API for mosque/iqama/user data           │
│  - WebSocket for live azan stream relay          │
│  - Push notification scheduling (FCM/APNs)       │
└──────────┬───────────┬───────────┬──────────────┘
           │           │           │
    ┌──────▼──┐  ┌─────▼────┐  ┌──▼──────────┐
    │PostgreSQL│  │  Redis   │  │ Aladhan API │
    │(primary) │  │(caching/ │  │ (prayer     │
    │          │  │ pub-sub) │  │  times)     │
    └─────────┘  └──────────┘  └─────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React Native + Expo | Single codebase for iOS, Android, and Web |
| Backend | Node.js + Express + TypeScript | JS ecosystem alignment, real-time capable |
| Database | PostgreSQL | Relational data (mosques, schedules, users) |
| Cache | Redis | Caching prayer times, pub-sub for live streams |
| Prayer API | Aladhan API (`api.aladhan.com/v1/timings`) | Free, accurate, supports multiple calc methods |
| Offline calc | `adhan` npm package | Local astronomical prayer time calculation |
| Audio streaming | WebRTC / HLS | Live azan from mosque microphones |
| Push notifications | Firebase Cloud Messaging (FCM) | Cross-platform push for iqama alerts |
| Auth | Firebase Auth or Supabase Auth | Simple email/phone auth |

---

## Project Structure (Monorepo)

```
LiveAzan/
├── apps/
│   ├── mobile/                  # React Native (Expo) app
│   │   ├── app/                 # Expo Router screens
│   │   │   ├── (tabs)/
│   │   │   │   ├── index.tsx        # Home — prayer times + next iqama
│   │   │   │   ├── mosques.tsx      # Nearby mosques list/map
│   │   │   │   ├── settings.tsx     # User preferences
│   │   │   │   └── _layout.tsx      # Tab navigation layout
│   │   │   ├── mosque/
│   │   │   │   └── [id].tsx         # Single mosque detail page
│   │   │   └── _layout.tsx          # Root layout
│   │   ├── components/
│   │   │   ├── PrayerTimeCard.tsx   # Individual prayer time display
│   │   │   ├── IqamaCountdown.tsx   # Countdown to next iqama
│   │   │   ├── AzanPlayer.tsx       # Audio player (live + recorded)
│   │   │   ├── MosqueCard.tsx       # Mosque list item
│   │   │   └── MosqueMap.tsx        # Map with mosque markers
│   │   ├── services/
│   │   │   ├── prayerTimes.ts       # Aladhan API + offline calculation
│   │   │   ├── azanAudio.ts         # Audio playback manager
│   │   │   ├── notifications.ts     # Push notification scheduling
│   │   │   ├── location.ts          # Geolocation service
│   │   │   └── api.ts               # Backend API client
│   │   ├── stores/
│   │   │   ├── prayerStore.ts       # Zustand store for prayer times
│   │   │   ├── mosqueStore.ts       # Zustand store for mosque data
│   │   │   └── settingsStore.ts     # User preferences store
│   │   ├── assets/
│   │   │   └── azan/                # Recorded azan audio files
│   │   ├── app.json
│   │   └── package.json
│   │
│   └── admin/                   # Mosque admin web portal
│       ├── src/
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx    # Mosque admin dashboard
│       │   │   ├── IqamaEditor.tsx  # Edit iqama times
│       │   │   └── StreamSetup.tsx  # Configure live azan stream
│       │   └── App.tsx
│       └── package.json
│
├── packages/
│   └── shared/                  # Shared types and utilities
│       ├── types.ts                 # TypeScript interfaces
│       ├── constants.ts             # Prayer names, calc methods
│       └── utils.ts                 # Shared helpers
│
├── server/                      # Backend API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── mosques.ts           # CRUD mosques
│   │   │   ├── iqama.ts             # Iqama schedule endpoints
│   │   │   ├── prayerTimes.ts       # Prayer times proxy/cache
│   │   │   ├── stream.ts            # Live azan streaming
│   │   │   └── users.ts            # User management
│   │   ├── models/
│   │   │   ├── Mosque.ts
│   │   │   ├── IqamaSchedule.ts
│   │   │   └── User.ts
│   │   ├── services/
│   │   │   ├── aladhanService.ts    # Aladhan API integration
│   │   │   ├── notificationService.ts # Push notification scheduling
│   │   │   └── streamService.ts     # Live azan stream management
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   └── index.ts                 # Express app entry
│   ├── prisma/
│   │   └── schema.prisma            # Database schema
│   └── package.json
│
├── package.json                 # Root workspace config
├── turbo.json                   # Turborepo config
└── README.md
```

---

## Data Models

### `schema.prisma`

```prisma
model Mosque {
  id              String    @id @default(uuid())
  name            String
  address         String
  city            String
  state           String
  country         String
  latitude        Float
  longitude       Float
  phone           String?
  website         String?
  hasLiveStream   Boolean   @default(false)
  streamUrl       String?
  adminEmail      String?
  verified        Boolean   @default(false)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  iqamaSchedules  IqamaSchedule[]
  followers       UserMosque[]
}

model IqamaSchedule {
  id            String    @id @default(uuid())
  mosqueId      String
  mosque        Mosque    @relation(fields: [mosqueId], references: [id])
  prayer        Prayer    // enum: FAJR, DHUHR, ASR, MAGHRIB, ISHA, JUMMAH
  iqamaTime     String    // "HH:mm" format
  effectiveFrom DateTime  // When this schedule takes effect
  effectiveTo   DateTime? // Null = still current
  createdAt     DateTime  @default(now())

  @@index([mosqueId, prayer, effectiveFrom])
}

model User {
  id                  String    @id @default(uuid())
  email               String?   @unique
  phone               String?   @unique
  displayName         String?
  notifyMinutesBefore Int       @default(15)  // 10-15 min before iqama
  calcMethod          Int       @default(2)   // ISNA=2, MWL=3, etc.
  azanSound           String    @default("default")
  createdAt           DateTime  @default(now())

  mosques             UserMosque[]
}

model UserMosque {
  userId    String
  mosqueId  String
  user      User    @relation(fields: [userId], references: [id])
  mosque    Mosque  @relation(fields: [mosqueId], references: [id])
  isPrimary Boolean @default(false)

  @@id([userId, mosqueId])
}

enum Prayer {
  FAJR
  DHUHR
  ASR
  MAGHRIB
  ISHA
  JUMMAH
}
```

---

## Core Functions

### 1. Prayer Times Service (`apps/mobile/services/prayerTimes.ts`)

```
getPrayerTimes(lat, lon, date, method) → PrayerTimes
  - Try Aladhan API first: GET api.aladhan.com/v1/timings/{date}?latitude=X&longitude=Y&method=Z
  - On failure, use `adhan` npm package for offline calculation
  - Cache results in AsyncStorage for 24 hours

getNextPrayer(prayerTimes) → { name, time, timeUntil }
  - Compare current time against all 5 prayer times
  - Return the next upcoming prayer
```

### 2. Iqama Service (`apps/mobile/services/api.ts`)

```
getMosqueIqamaTimes(mosqueId, date) → IqamaSchedule[]
  - GET /api/mosques/:id/iqama?date=YYYY-MM-DD
  - Returns mosque-specific iqama times for the day

getNextIqama(mosqueId) → { prayer, iqamaTime, minutesUntil }
  - Finds next upcoming iqama for the user's primary mosque
  - This is what drives notifications, NOT prayer start time
```

### 3. Notification Scheduler (`apps/mobile/services/notifications.ts`)

```
scheduleIqamaNotification(prayer, iqamaTime, minutesBefore)
  - Schedules local push notification for (iqamaTime - minutesBefore)
  - Example: Dhuhr iqama at 1:30 PM, notify at 1:15 PM (15 min before)
  - Notification text: "Dhuhr iqama at [MosqueName] in 15 minutes"

rescheduleAllNotifications(mosqueId)
  - Called when iqama times update
  - Cancels existing notifications, reschedules with new times

scheduleAzanPlayback(prayer, iqamaTime, minutesBefore)
  - At notification time, play live azan if available, else recorded
```

### 4. Azan Audio Player (`apps/mobile/components/AzanPlayer.tsx`)

```
playAzan(mosqueId, prayer)
  - Check if mosque has live stream → connect to WebSocket/HLS
  - If no live stream → play bundled recorded azan audio
  - Handle audio focus, background playback, do-not-disturb

connectLiveStream(streamUrl) → AudioStream
  - Connect to mosque's live azan stream
  - Handle reconnection on network issues

playRecordedAzan(azanName) → void
  - Play from local assets (multiple azan recordings available)
```

### 5. Location & Mosque Discovery (`apps/mobile/services/location.ts`)

```
getCurrentLocation() → { latitude, longitude }
  - Request location permission
  - Get GPS coordinates

getNearbyMosques(lat, lon, radiusKm) → Mosque[]
  - GET /api/mosques/nearby?lat=X&lon=Y&radius=Z
  - Returns mosques sorted by distance
  - Uses PostGIS for geo queries
```

### 6. Mosque Admin Portal (`apps/admin/`)

```
updateIqamaTimes(mosqueId, schedules[])
  - Admin form to set iqama times for each prayer
  - Can set effective dates (seasonal changes)
  - Triggers re-notification for all followers

setupLiveStream(mosqueId, streamConfig)
  - Configure audio source for live azan streaming
  - Test stream connectivity
  - Enable/disable live streaming
```

---

## Travel-Aware Auto-Detection (Core Feature)

When the user is traveling within their timezone, the app must **automatically**:

1. **Detect location changes** using background geolocation (geofencing)
2. **Find the nearest masjid** to the new location
3. **Fetch that masjid's iqama times** (not the user's home masjid)
4. **Notify with azan** 10-15 min before iqama at the nearest masjid

### How It Works

```
┌─────────────────────────────────────────────────────┐
│  Background Geolocation Service                      │
│                                                      │
│  1. Monitor location changes (significant change API)│
│  2. When location moves > 2km from last check:       │
│     → Query backend: GET /api/mosques/nearest?lat&lon│
│     → Get that mosque's iqama schedule               │
│     → Cancel old notifications                       │
│     → Schedule new notifications for nearest mosque  │
│     → Cache new mosque as "active mosque"             │
│  3. On prayer time approach:                          │
│     → Re-check location (user may still be moving)    │
│     → Confirm nearest mosque                          │
│     → Fire notification 10-15 min before iqama       │
│     → Play azan (live if available, else recorded)    │
└─────────────────────────────────────────────────────┘
```

### Implementation Details

**`apps/mobile/services/travelDetection.ts`**
```
startBackgroundLocationTracking()
  - Uses expo-location's startLocationUpdatesAsync()
  - Monitors significant location changes (>2km threshold)
  - Runs even when app is in background/killed
  - Battery-efficient: uses cell tower + WiFi, not constant GPS

onLocationChange(newLat, newLon)
  - Compare against last known position
  - If moved significantly → findNearestMosque(newLat, newLon)
  - Update active mosque and reschedule notifications

findAndSwitchMosque(lat, lon) → Mosque
  - GET /api/mosques/nearest?lat=X&lon=Y
  - If different from current active mosque:
    → cancelAllNotifications()
    → fetchIqamaTimes(newMosque.id)
    → scheduleIqamaNotifications(newMosque)
    → show silent notification: "Switched to [MosqueName] (0.3km away)"
```

**Key edge cases handled:**
- User is driving → don't switch mosques every minute, use 2km threshold + 5 min cooldown
- No mosque found within 10km → fall back to prayer times only (no iqama)
- User returns home → auto-switch back to home/primary mosque
- Multiple mosques equidistant → prefer the one with verified iqama times
- Offline → use last known iqama times until connectivity restores

---

## Single-File Setup Script (`setup.py`)

One Python file that sets up **everything** on Linux, Mac, or Windows — no `.env` files, no manual configuration.

### What `setup.py` Does

```python
# Run: python3 setup.py
# That's it. Everything else is automatic.

1. Detect OS (Linux/Mac/Windows)
2. Check & install system dependencies:
   - Node.js (via nvm/fnm or direct download)
   - Python 3.10+ (verify existing)
   - PostgreSQL (via apt/brew/chocolatey or Docker)
   - Redis (via apt/brew/chocolatey or Docker)
   - Git (verify existing)
3. Create PostgreSQL database & user (auto-generated password)
4. Start Redis
5. Install all npm dependencies (root + apps + server)
6. Generate Prisma client & run migrations
7. Auto-generate .env files with:
   - Random JWT secret
   - Database URL (using auto-created credentials)
   - Redis URL
   - Aladhan API base URL
   - Firebase config placeholder (with instructions)
8. Seed database with sample mosque data (Waterloo mosques)
9. Build the project
10. Print summary: URLs, credentials, next steps

# Production mode:
# python3 setup.py --production
# → Uses Docker Compose for PostgreSQL + Redis
# → Sets up systemd/launchd services
# → Configures SSL with Let's Encrypt
# → Sets up proper logging
```

### Cross-Platform Strategy

| Step | Linux | Mac | Windows |
|------|-------|-----|---------|
| Node.js | `apt install` or `nvm` | `brew install` or `nvm` | `winget` or `fnm` |
| PostgreSQL | `apt install` or Docker | `brew install` or Docker | `chocolatey` or Docker |
| Redis | `apt install` or Docker | `brew install` or Docker | Docker (no native Windows Redis) |
| npm install | Same everywhere | Same | Same |
| Service mgmt | systemd | launchd | Windows Service |

### File: `setup.py` location
- Lives at repo root: `/LiveAzan/setup.py`
- Zero dependencies beyond Python 3.10 stdlib
- Uses `subprocess`, `platform`, `shutil`, `json`, `secrets` — all stdlib
- Prompts user only for: Firebase project ID (optional, can skip for dev)

---

## Key User Flows

### Flow 1: First-time User Setup
1. Open app → grant location permission
2. App shows nearby mosques (from database)
3. User selects their primary masjid
4. App loads that mosque's iqama times
5. App shows today's prayer times + iqama times side by side
6. User sets notification preference (10 or 15 min before iqama)
7. Notifications are scheduled

### Flow 2: Iqama Alert Fires
1. 15 min before Dhuhr iqama → notification appears
2. User taps notification → app opens
3. If mosque has live stream → "Listen Live" button available
4. If no live stream → recorded azan plays automatically
5. Countdown to iqama displayed prominently

### Flow 3: Traveling User (Auto-Detection)
1. User is at home → app tracks home mosque (Waterloo Masjid)
2. User drives to Toronto (100km away)
3. Background location detects significant move (>2km threshold)
4. App queries: nearest mosque to new coordinates
5. Finds "Islamic Foundation of Toronto" → switches active mosque
6. Fetches Toronto mosque iqama times
7. Cancels Waterloo notifications, schedules Toronto ones
8. Silent notification: "Switched to Islamic Foundation of Toronto (0.5km)"
9. 15 min before Dhuhr iqama at Toronto mosque → azan plays
10. User drives home → auto-switches back to Waterloo Masjid

### Flow 4: Mosque Admin Updates Iqama
1. Admin logs into web portal
2. Updates Dhuhr iqama from 1:30 PM to 1:45 PM
3. Backend pushes update to all mosque followers
4. Users' notifications automatically rescheduled

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Files to create:**
- `package.json` (root workspace with Turborepo)
- `apps/mobile/` — Expo project scaffolding with Expo Router
- `server/` — Express + TypeScript + Prisma setup
- `packages/shared/types.ts` — Shared TypeScript types
- `server/prisma/schema.prisma` — Database schema

**Deliverables:**
- [ ] Monorepo setup with Turborepo
- [ ] Expo app with tab navigation (Home, Mosques, Settings)
- [ ] Express server with PostgreSQL + Prisma
- [ ] Database migrations for Mosque, IqamaSchedule, User tables
- [ ] Basic API routes: CRUD mosques, iqama schedules

### Phase 2: Prayer Times + Location (Week 3-4)
**Files to create:**
- `apps/mobile/services/prayerTimes.ts`
- `apps/mobile/services/location.ts`
- `apps/mobile/components/PrayerTimeCard.tsx`
- `server/src/services/aladhanService.ts`

**Deliverables:**
- [ ] Aladhan API integration with caching
- [ ] Offline prayer time calculation using `adhan` package
- [ ] Geolocation service
- [ ] Home screen showing today's 5 prayer times
- [ ] Next prayer countdown

### Phase 3: Mosque Integration + Iqama (Week 5-6)
**Files to create:**
- `apps/mobile/components/MosqueCard.tsx`
- `apps/mobile/components/MosqueMap.tsx`
- `apps/mobile/components/IqamaCountdown.tsx`
- `apps/mobile/stores/mosqueStore.ts`
- `server/src/routes/iqama.ts`

**Deliverables:**
- [ ] Nearby mosque discovery (map + list view)
- [ ] Mosque detail page with iqama schedule
- [ ] User links to their primary mosque
- [ ] Iqama times displayed alongside prayer times
- [ ] "Next iqama" countdown on home screen

### Phase 4: Notifications + Recorded Azan (Week 7-8)
**Files to create:**
- `apps/mobile/services/notifications.ts`
- `apps/mobile/services/azanAudio.ts`
- `apps/mobile/components/AzanPlayer.tsx`
- `server/src/services/notificationService.ts`

**Deliverables:**
- [ ] Local push notifications 10-15 min before iqama
- [ ] Recorded azan playback on notification
- [ ] Background audio support
- [ ] User preference for notification timing
- [ ] Multiple azan recording choices

### Phase 5: Mosque Admin Portal (Week 9-10)
**Files to create:**
- `apps/admin/` — React web app (Vite)
- `server/src/middleware/auth.ts`

**Deliverables:**
- [ ] Admin authentication (mosque admins only)
- [ ] Iqama time editor with effective dates
- [ ] Real-time push of iqama changes to followers
- [ ] Dashboard showing follower count

### Phase 6: Live Azan Streaming (Week 11-12)
**Files to create:**
- `server/src/services/streamService.ts`
- `server/src/routes/stream.ts`

**Deliverables:**
- [ ] HLS/WebRTC audio streaming from mosque to users
- [ ] Mosque-side stream setup (microphone → server)
- [ ] "Listen Live" button in app
- [ ] Fallback to recorded azan when stream unavailable
- [ ] Stream health monitoring

---

## Verification Plan

1. **Unit tests**: Prayer time calculation, notification scheduling logic, iqama time lookups
2. **Integration tests**: Aladhan API calls, database CRUD operations, push notification delivery
3. **E2E tests**: Full user flow — location → mosque selection → iqama notification → azan playback
4. **Manual testing**:
   - Install on iOS/Android via Expo Go
   - Verify prayer times against known sources
   - Set iqama notification → confirm it fires at correct time
   - Test offline mode (airplane mode → prayer times still work)
   - Test live stream connection and fallback to recorded azan
5. **Run commands**:
   - `cd apps/mobile && npx expo start` — start mobile app
   - `cd server && npm run dev` — start backend
   - `npm run test` — run all tests
   - `npm run lint` — check code quality
