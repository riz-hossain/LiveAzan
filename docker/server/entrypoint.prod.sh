#!/bin/sh
set -e

echo "==> Running database migrations..."
npx prisma migrate deploy

echo "==> Seeding database (idempotent)..."
npx tsx prisma/seed.ts || true

echo "==> Starting server..."
exec npx tsx src/index.ts
