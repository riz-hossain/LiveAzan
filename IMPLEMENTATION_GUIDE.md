# LiveAzan — Implementation Guide

> A mosque-centric prayer application that connects Muslim communities to their local masjids through iqama times, live azan streaming, and smart notifications.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Project Setup](#project-setup)
4. [Backend Setup](#backend-setup)
5. [Mobile App Setup](#mobile-app-setup)
6. [Database Setup](#database-setup)
7. [API Endpoints Reference](#api-endpoints-reference)
8. [Mosque Data Format](#mosque-data-format)
9. [Adding a New City](#adding-a-new-city)
10. [Environment Variables](#environment-variables)
11. [Development Workflow](#development-workflow)
12. [Deployment](#deployment)
13. [Architecture Decisions](#architecture-decisions)
14. [Troubleshooting](#troubleshooting)
15. [How Iqama Times Are Found](#how-iqama-times-are-found)

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/riz-hossain/LiveAzan.git
cd LiveAzan

# 2. Run the automated setup (installs everything)
python3 setup.py

# 3. Start the backend server
cd server && npm run dev

# 4. Start the mobile app (in another terminal)
cd apps/mobile && npx expo start
```

That's it. The setup script handles Node.js, PostgreSQL, Redis, npm dependencies, database migrations, and environment files.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Python 3.10+** | 3.10+ | Runs `setup.py` (uses only stdlib) |
| **Node.js** | 18+ | Backend + frontend runtime |
| **PostgreSQL** | 14+ | Primary database |
| **Redis** | 7+ | Caching + pub-sub |
| **Git** | 2.30+ | Version control |

> **Note**: `setup.py` will detect and install missing dependencies automatically on Linux, macOS, and Windows.

---

## Project Setup

### Step 1: Install Root Dependencies

```bash
# From repo root
npm install
```

This installs Turborepo and workspace dependencies for the monorepo.

### Step 2: Understand the Monorepo Structure

```
LiveAzan/
├── apps/
│   ├── mobile/          # React Native (Expo) — iOS, Android, Web
│   └── admin/           # Mosque admin web portal (React + Vite)
├── packages/
│   └── shared/          # Shared TypeScript types, constants, utils
├── server/              # Node.js + Express + Prisma backend
├── data/
│   └── mosques/         # JSON seed data for mosques by city
│       └── canada/
│           └── ontario/
│               ├── toronto.json
│               ├── ottawa.json
│               ├── waterloo.json
│               ├── hamilton.json
│               └── ... (all Ontario cities)
├── scripts/             # Data research & scraping utilities
├── setup.py             # One-command setup for the entire project
├── package.json         # Root workspace config
└── turbo.json           # Turborepo pipeline config
```

### Step 3: Build All Packages

```bash
# Build shared packages first, then apps
npx turbo build
```

---

## Backend Setup

### Step 1: Navigate to server

```bash
cd server
```

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Configure environment

Create `server/.env`:

```env
# Database
DATABASE_URL="postgresql://liveazan:YOUR_PASSWORD@localhost:5432/liveazan"

# Redis
REDIS_URL="redis://localhost:6379"

# Auth
JWT_SECRET="generate-a-random-64-char-string"

# Aladhan API (free, no key required)
ALADHAN_API_URL="https://api.aladhan.com/v1"

# Server
PORT=3001
NODE_ENV=development
```

> **Tip**: `setup.py` generates this file automatically with random secrets.

### Step 4: Set up the database

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# Seed with mosque data from data/ directory
npx prisma db seed
```

### Step 5: Start the server

```bash
npm run dev
```

Server runs at `http://localhost:3001`. Test it:

```bash
curl http://localhost:3001/api/mosques
```

---

## Mobile App Setup

### Step 1: Navigate to mobile app

```bash
cd apps/mobile
```

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Configure API URL

Edit `apps/mobile/services/api.ts` and set:

```typescript
const API_BASE_URL = 'http://localhost:3001/api';
// For physical device testing, use your machine's local IP:
// const API_BASE_URL = 'http://192.168.1.X:3001/api';
```

### Step 4: Start Expo

```bash
npx expo start
```

Options:
- Press `w` — open in web browser
- Press `i` — open in iOS simulator (macOS only)
- Press `a` — open in Android emulator
- Scan QR code — open on physical device via Expo Go app

---

## Database Setup

### Schema Overview

The database has 4 main tables:

| Table | Purpose |
|-------|---------|
| `Mosque` | Mosque info: name, address, coordinates, stream URL |
| `IqamaSchedule` | Iqama times per prayer per mosque (with effective dates) |
| `User` | User preferences: notification timing, calculation method |
| `UserMosque` | Many-to-many: which mosques a user follows |

### Key Relationships

```
User ──┐
       ├── UserMosque ──── Mosque
       │                     │
       │              IqamaSchedule
       │
       └── (preferences: notifyMinutesBefore, calcMethod, azanSound)
```

### Common Database Commands

```bash
# View database in browser
npx prisma studio

# Create a new migration after schema changes
npx prisma migrate dev --name describe_your_change

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Seed database with mosque data
npx prisma db seed
```

---

## API Endpoints Reference

### Mosques

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/mosques` | List all mosques |
| `GET` | `/api/mosques/:id` | Get mosque by ID |
| `GET` | `/api/mosques/nearby?lat=X&lon=Y&radius=Z` | Find mosques within radius (km) |
| `GET` | `/api/mosques/nearest?lat=X&lon=Y` | Find single nearest mosque |
| `POST` | `/api/mosques` | Create mosque (admin) |
| `PUT` | `/api/mosques/:id` | Update mosque (admin) |

### Iqama Times

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/mosques/:id/iqama` | Current iqama times (what the app asks for) |
| `GET` | `/api/iqama/:mosqueId` | Get current iqama schedule |
| `GET` | `/api/iqama/:mosqueId?date=YYYY-MM-DD` | Get iqama for specific date |
| `PUT` | `/api/iqama/:mosqueId` | Update iqama times (mosque admin) |

### Prayer Times

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/prayer-times?lat=X&lon=Y&date=YYYY-MM-DD&method=2` | Get prayer times from Aladhan API (cached) |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/users/me` | Get current user profile |
| `PUT` | `/api/users/me` | Update preferences |
| `POST` | `/api/users/me/mosques/:mosqueId` | Follow a mosque |
| `DELETE` | `/api/users/me/mosques/:mosqueId` | Unfollow a mosque |

### Coverage Requests

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/coverage-requests` | Request coverage for a new city |
| `GET` | `/api/coverage-requests` | List pending requests (admin) |

---

## Mosque Data Format

All mosque seed data lives in `data/mosques/canada/<province>/<city>.json`.

### JSON Structure

```json
{
  "region": "city-name",
  "province": "Ontario",
  "country": "canada",
  "centerLat": 43.2551,
  "centerLon": -79.8711,
  "radiusKm": 300,
  "lastResearched": "2026-03-15",
  "researchedBy": "admin",
  "mosques": [
    {
      "name": "Full Mosque Name",
      "type": "mosque",
      "address": "123 Street, City, ON POSTAL",
      "city": "City",
      "province": "Ontario",
      "country": "Canada",
      "latitude": 43.2551,
      "longitude": -79.8711,
      "phone": "+1-XXX-XXX-XXXX",
      "website": "https://example.com",
      "googleRating": 4.5,
      "googleReviewCount": 120,
      "hasLiveStream": false,
      "verified": true,
      "iqamaTimes": {
        "fajr": "06:30",
        "dhuhr": "13:30",
        "asr": "17:30",
        "maghrib": "sunset+5",
        "isha": "21:00",
        "jummah": "13:30"
      },
      "sources": ["masjidbox.com", "google-maps"]
    },
    {
      "name": "Community Musalla Name",
      "type": "musalla",
      "address": "456 Street, City, ON POSTAL",
      "city": "City",
      "province": "Ontario",
      "country": "Canada",
      "latitude": 43.2600,
      "longitude": -79.8800,
      "phone": null,
      "website": null,
      "googleRating": 4.8,
      "googleReviewCount": 10,
      "hasLiveStream": false,
      "verified": false,
      "iqamaTimes": null,
      "sources": ["google-maps"],
      "notes": "Community prayer space. Open during specific hours."
    }
  ]
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Official mosque/musalla name |
| `type` | string | `"mosque"` for full mosques, `"musalla"` for prayer rooms/spaces |
| `address` | string | Full street address with postal code |
| `city` | string | City name |
| `province` | string | Province name (e.g., "Ontario") |
| `latitude/longitude` | float | GPS coordinates (use Google Maps to verify) |
| `phone` | string/null | Contact phone number |
| `website` | string/null | Official website URL |
| `googleRating` | float/null | Google Maps rating (e.g., 4.5) |
| `googleReviewCount` | int/null | Number of Google reviews |
| `hasLiveStream` | boolean | Whether mosque streams live azan |
| `verified` | boolean | Whether iqama times are confirmed |
| `iqamaTimes` | object/null | Null for musallas without known schedules |
| `iqamaTimes.maghrib` | string | Use `"sunset+N"` format for minutes after sunset |
| `sources` | string[] | Where data was sourced from |
| `notes` | string/null | Extra info (hours, special details, etc.) |

### Mosque vs Musalla

- **Mosque** (`"type": "mosque"`): Full-service masjid with regular congregational prayers, iqama times, possibly a resident imam
- **Musalla** (`"type": "musalla"`): Prayer room or informal prayer space (community centres, university rooms, rented spaces). May not have fixed iqama times or a website. Still valuable to list so users can find nearby prayer spaces

---

## Adding a New City

Follow these steps to add mosque data for a new city:

### Step 1: Research Mosques

Use these sources to find mosques in the city:

1. **Google Maps** — Search "mosque near [city name]" and note names, addresses, coordinates
2. **masjidbox.com** — Search for city, get iqama times
3. **prayersconnect.com** — Another iqama time source
4. **mawaqit.net** — European + some North American mosques
5. **Mosque websites** — Many post iqama times on their own sites

### Step 2: Create the JSON File

```bash
# Create the city file
touch data/mosques/canada/ontario/city-name.json
```

Use the JSON structure from the [Mosque Data Format](#mosque-data-format) section above.

### Step 3: Get GPS Coordinates

1. Go to Google Maps
2. Search for the mosque address
3. Right-click on the mosque location
4. Click the coordinates to copy them
5. First number = latitude, second = longitude

### Step 4: Update the Coverage Map

Add an entry to `data/mosques/_meta/coverage-map.json`:

```json
{
  "file": "canada/ontario/city-name.json",
  "city": "City Name",
  "province": "Ontario",
  "mosquesCount": 3
}
```

### Step 5: Seed the Database

```bash
cd server && npx prisma db seed
```

---

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | Yes | — | Secret for JWT token signing |
| `ALADHAN_API_URL` | No | `https://api.aladhan.com/v1` | Prayer times API |
| `PORT` | No | `3001` | Server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `FIREBASE_PROJECT_ID` | No | — | For push notifications (Phase 4+) |

---

## Development Workflow

### Daily Development

```bash
# Terminal 1: Start backend
cd server && npm run dev

# Terminal 2: Start mobile app
cd apps/mobile && npx expo start

# Terminal 3: Watch shared package for changes
cd packages/shared && npm run dev
```

### Running Tests

```bash
# Run all tests
npm run test

# Run server tests only
cd server && npm run test

# Run mobile tests only
cd apps/mobile && npm run test
```

The iqama reader in `packages/shared` and the app's use of it in `apps/mobile` have offline test suites (`cd packages/shared && npm test`, `cd apps/mobile && npm test`); see [How Iqama Times Are Found](#how-iqama-times-are-found).

### Code Quality

```bash
# Lint all packages
npm run lint

# Type check
npx turbo typecheck
```

### Git Workflow

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Make changes, then commit
git add .
git commit -m "Add: description of what you added"

# Push and create PR
git push -u origin feature/your-feature-name
```

---

## Deployment

### Option 1: Docker (Recommended)

```bash
python3 setup.py --production
# This creates docker-compose.yml and starts all services
```

### Option 2: Manual

1. **Backend**: Deploy `server/` to any Node.js host (Railway, Render, DigitalOcean)
2. **Database**: Use managed PostgreSQL (Supabase, Neon, RDS)
3. **Redis**: Use managed Redis (Upstash, ElastiCache)
4. **Mobile**: Build with `eas build` and submit to App Store / Google Play

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET` (64+ random characters)
- [ ] Enable HTTPS/SSL
- [ ] Set up database backups
- [ ] Configure Firebase for push notifications
- [ ] Set up error monitoring (Sentry)
- [ ] Configure rate limiting on API
- [ ] Set up CI/CD pipeline

---

## Architecture Decisions

### Why Iqama Times Instead of Prayer Times?

Most prayer apps show **adhan times** (astronomical calculation). But Muslims actually pray at **iqama time** — which can differ by 5-70 minutes depending on the mosque and prayer. LiveAzan notifies based on your mosque's actual iqama time.

### Why Monorepo with Turborepo?

- Shared TypeScript types between frontend and backend
- Single `npm install` at root
- Parallel builds with caching
- One repo to manage, one CI pipeline

### Why Expo (React Native)?

- Single codebase for iOS, Android, and Web
- Expo Router for file-based routing
- Easy push notifications via `expo-notifications`
- OTA updates without app store review

### Why PostgreSQL Over MongoDB?

- Mosque data is relational (mosques → iqama schedules → users)
- PostGIS extension for geospatial queries (nearby mosque search)
- ACID transactions for reliable data updates
- Prisma ORM works best with SQL databases

### Why Aladhan API?

- Free and open source
- Supports 15+ calculation methods (ISNA, MWL, Egypt, etc.)
- Accurate astronomical calculations
- No API key required
- Fallback: `adhan` npm package for offline calculation

---

## Troubleshooting

### "Cannot connect to database"

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql  # Linux
brew services list                # macOS

# Start PostgreSQL
sudo systemctl start postgresql   # Linux
brew services start postgresql    # macOS
```

### "Redis connection refused"

```bash
# Check if Redis is running
redis-cli ping  # Should return "PONG"

# Start Redis
sudo systemctl start redis        # Linux
brew services start redis          # macOS
```

### "Prisma client not generated"

```bash
cd server && npx prisma generate
```

### "Expo app can't connect to backend"

- Make sure the backend is running on port 3001
- For physical devices, use your machine's local IP (not `localhost`)
- Check firewall isn't blocking port 3001

### "npm install fails"

```bash
# Clear npm cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### "Prayer times not loading"

- Check internet connection (Aladhan API requires internet)
- The `adhan` npm package provides offline fallback
- Verify coordinates are correct (lat/lon not swapped)

---

## How Iqama Times Are Found

A mosque's iqama times are read by one shared toolkit, `packages/shared/src/iqama/`, so that the server and the phone follow the same rules. It is plain TypeScript with no network, DOM or Node dependency of its own: the caller hands in `fetchText` (and `render`, if it has a browser for pages that draw their times with JavaScript). That is also what lets its tests run on made-up pages with no connection.

### Where the times come from

`readMosque` (`pipeline.ts`) asks every source at once and keeps the strongest reading that passes every check below.

| Source | Confidence | What it is |
|--------|------------|------------|
| `plugin` | exact | The mosque's own WordPress "Daily Prayer Time for Mosques" API: a year of congregation times, nothing scraped |
| `website` | labelled / headed | The mosque's own web page, read where the times sit under an "Iqama" label or column heading |
| `mawaqit` | exact | The mosque's page on mawaqit.net, found by its slug or by where it is. Offsets such as "+10" are added to that same prayer's adhan |
| `website` | guessed | A page with five times and nothing saying which are the iqama. Used only when nothing better exists |
| `nearby` | approximate | `borrowFromNeighbour`, called only when a mosque has nothing of its own: a neighbouring mosque's times, labelled with its name and distance |

When two sources disagree by more than ten minutes, the preferred one is returned and the other is reported as the `disagreement`, with the dissenting source named. A listing on mawaqit.net can be years out of date (mosques leave their times unset), so it is never taken over the mosque's own page.

### The rule everything else follows

**A wrong time is worse than no time.** People plan their day around these, so the reader refuses rather than guesses. A reading is discarded when:

- the five prayers are not in order, or an iqama falls before its adhan or more than 90 minutes after it;
- the times look like a template (every adhan on the half hour, or a row of placeholders);
- the page is for another day, month or year. Dates, "from" and "until" cues and date ranges are read, and a table that names today beats one that merely might be current;
- the sun disagrees: Fajr before first light, Maghrib far from sunset, and so on, worked out from the mosque's own coordinates;
- the page shows several different sets of times and nothing says which is in force today.

Days and clocks are the **mosque's**, never the server's or the phone's (`zoneForPlace`, `todayInZone`, `offsetHoursForZone`): a server in UTC asked about Vancouver at eight in the evening is asking about a day that has not yet ended there.

### Using it

```ts
import { readMosque, offsetHoursForZone, todayInZone, zoneForPlace } from "@live-azan/shared";

const zone = zoneForPlace({ province: mosque.province, longitude: mosque.longitude });
const today = todayInZone(zone);

const outcome = await readMosque(
  { name: mosque.name, latitude: mosque.latitude, longitude: mosque.longitude, website: mosque.website },
  {
    fetchText, // (url, { timeoutMs }) => { url, status, contentType, body }
    today,
    where: { lat: mosque.latitude, lon: mosque.longitude, utcOffsetHours: zone ? offsetHoursForZone(today, zone) : undefined },
  }
);

outcome.reading; // { times, source, how, asOf, page, warnings, jumuah?, validUntil?, corroboratedBy? }, or null
outcome.problems; // why the sources that failed failed, in words for a person
```

The single-source pieces (`extractIqama`, `readPlugin`, `readMawaqit`, `readWebsite`) are exported for callers that want only one of them.

**MAWAQIT limits how fast it is asked.** It sits behind Cloudflare, which answers `429` (`error code: 1015`, with a `Retry-After`) once an address has made about sixty requests in a short while, and refuses everything from that address for several minutes. One person opening a mosque never meets it; a loop over hundreds of mosques does within seconds. Anything that asks in bulk (the server's weekly job, `scripts/enrich-iqama.ts`, a measurement) must wrap its fetch in `politeTo` (`adapters.ts`), which spaces requests to a named host, and after a 429 sends nothing more to it until it said it would be ready, so the rest of a batch carries on with the mosques' own sites. The server keeps three seconds between requests to MAWAQIT and the app one; the reader reports a refusal as "mawaqit.net is limiting requests just now" rather than as a mosque that could not be found.

### In the app

- **The list is cheap and honest.** A mosque list shows what the mosque came with: the bundled research, as *saved times* with the day it was researched, and, for a mosque with none, what MAWAQIT's one search request says, only when the listing is strongly the same mosque (`samePlace`). Websites are not read for a list, which can be dozens of mosques long.
- **Opening a mosque reads it properly.** The mosque screen, and the home screen for the primary mosque, read its timetable plugin, its web page and its MAWAQIT listing in the background (`refreshSingleMosqueIqama`, at most 45 seconds), while saved times, or yesterday's, stay on screen labelled with their date. A mosque that gave nothing is not tried again on its own for six hours; the refresh button ignores that.
- **A mosque with nothing readable can borrow a neighbour's times**, only when the person asks (`borrowIqama`), and they are shown with the neighbour's name and distance, as approximate, never as the mosque's own.
- **Colour says how far to trust the times.** Green is the mosque's own reading of today; amber is worth a second look (a source disagreed, or the sun objected); red is old, guessed, or a neighbour's. The notes under the badge say why, in words (`packages/shared/src/iqama/present.ts`).
- **Saved research keeps its Maghrib.** Most mosques in the bundle give Maghrib as "sunset+5". `scripts/generate-mosque-bundle.py` keeps that as `maghribRule`, and the app works it out for the day, so it moves with the year instead of going stale as a clock time would. It also keeps `researchedOn`.

### On the server

- **The refresh job** (`server/src/jobs/iqamaRefreshJob.ts`) runs every Sunday at 2:00 AM for the cities where someone has a primary mosque, and reads each stale mosque with the same reader (`server/src/services/iqamaEnrichment.ts`). `POST /api/admin/enrich-mosque/:id` and `enrich-city` do the same by hand.
- **It stores only what could be shown to everyone without a word of caution** (`usable` in `iqamaPlan.ts`). A page that names no column, a reading that raised a warning, and two sources that disagree are left alone and the previous times stay: the phone can label such a reading, a database row cannot. The reason is in the result's `why`.
- **It writes rows only when a time has changed**, closing the old row as of the mosque's own today and keeping it as history. (The job it replaced added five rows per mosque per run whether or not anything had changed.)
- **The API always sends clock times.** The research the database is seeded from writes Maghrib as "sunset+5" for most mosques; the seed stores that text, and `resolveTimes` works it out for today at the mosque before any route sends it. A row that is neither a time nor such a rule is left out.
- **`GET /api/mosques/:id/iqama`** is what the app calls for a mosque's times, and `GET /api/mosques/nearby` takes `radiusKm` as the app sends it, as well as `radius`.
- **The server runs from source with tsx**, in Docker as in development, because it imports the shared package (also source). `npm run build` is a type-check. The images install OpenSSL, which Prisma needs and `node:20-alpine` no longer ships. Shell scripts are kept LF by `.gitattributes`, so a Windows checkout does not put carriage returns in them.
- **A Maghrib the page gives as "sunset + 5" is stored as that rule**, as the seed stores it, and served as the time it comes to today. It does not go stale, and the weekly run does not rewrite it.
- **The research script** (`npx tsx scripts/enrich-iqama.ts --city Waterloo --province Ontario`) uses the same reader to fill `data/mosques/**`, with the same rule about what may be written: what it leaves alone is listed with the reason, for a person to look at. It records the day each mosque was read as `iqamaAsOf`, which the bundle generator and the seed prefer to the file's `lastResearched`. Try it without touching the real data with `LIVEAZAN_DATA_ROOT=<a copy> npx tsx scripts/enrich-iqama.ts ...`.
- **Known gap: production has no database migrations.** There is no `server/prisma/migrations`, so the production entrypoint's `prisma migrate deploy` does nothing on an empty database (no tables are created) and fails with P3005 on one made with `db push`, as the local setup does. The local setup (`Dockerfile.local`, `db push`) is unaffected. Deciding between an initial migration and `db push` in production is left to whoever runs production.

### Tests

```bash
cd packages/shared && npm test   # the reader and the wording, on made-up pages
cd apps/mobile && npm test       # the store and services that use it, without a phone
cd server && npm test            # what is stored and served; set TEST_DATABASE_URL for the database tests
```

The shared suite runs offline against made-up pages and a made-up network, and runs on every push in the `Check` workflow. The app's suite runs the real store and services under Node with the two phone-only modules (AsyncStorage, SecureStore) faked, a made-up network, and a pinned clock, so it says the same in any season; it covers what the screens rely on but cannot themselves be tested for: that a slow read never draws over the mosque on screen now, that a server's older times never replace a reading of today, and that a failed look is not repeated on every visit. The server's suite has a part that runs against a real Postgres (`TEST_DATABASE_URL`, with the schema pushed; `Check` provides one). The app's type-check is a ratchet: `Check` fails on any error beyond the seven that predate it.

The reader was ported from the floating-clock desktop app's and checked against real mosque pages saved from across Canada: it returns the same times as the original on every page they were compared on. When the reader gets a page wrong, add that page's shape as a test first (`pageReader.test.ts` shows the pattern) and then fix it.

---

## Ontario Coverage

LiveAzan currently covers the following cities in Ontario:

| City | Mosques | Musallas | Total | Status |
|------|---------|----------|-------|--------|
| Toronto | 13 | 4 | 17 | Active |
| Ottawa | 5 | 4 | 9 | Active |
| Waterloo | 4 | 4 | 8 | Active |
| Brampton | 4 | 4 | 8 | Active |
| Mississauga | 4 | 3 | 7 | Active |
| Hamilton | 4 | 2 | 6 | Active |
| Markham/York Region | 4 | 2 | 6 | Active |
| Windsor | 3 | 2 | 5 | Active |
| Burlington/Oakville | 3 | 2 | 5 | Active |
| London | 3 | 1 | 4 | Active |
| Guelph | 2 | 1 | 3 | Active |
| Cambridge/Kitchener | 2 | 1 | 3 | Active |
| Whitby/Ajax/Pickering | 2 | 1 | 3 | Active |
| Oshawa | 3 | 0 | 3 | Active |
| Barrie | 2 | 0 | 2 | Active |
| Niagara/St. Catharines | 2 | 0 | 2 | Active |
| Kingston | 1 | 1 | 2 | Active |
| Milton | 1 | 1 | 2 | Active |
| Sudbury | 1 | 0 | 1 | Active |
| Thunder Bay | 1 | 0 | 1 | Active |
| Peterborough | 1 | 0 | 1 | Active |
| Brantford | 1 | 0 | 1 | Active |
| Cornwall | 1 | 0 | 1 | Active |
| Sarnia | 1 | 0 | 1 | Active |
| Sault Ste. Marie | 1 | 0 | 1 | Active |
| North Bay | 1 | 0 | 1 | Active |
| Belleville | 1 | 0 | 1 | Active |
| **Ontario Total** | **70** | **26** | **96** | |

> **Musallas** are community prayer spaces, university rooms, and informal gathering places for salah. They may not have fixed iqama times or a website, but are valuable for travelers and local Muslims looking for the nearest place to pray.

To request coverage for a city not listed, use the `/api/coverage-requests` endpoint or open a GitHub issue.
