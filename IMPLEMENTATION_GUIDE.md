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
