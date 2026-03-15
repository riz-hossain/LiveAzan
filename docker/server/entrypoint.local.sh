#!/bin/sh
set -e

echo "==> Generating Prisma client..."
npx prisma generate

echo "==> Pushing schema to database..."
npx prisma db push --skip-generate

echo "==> Seeding database (idempotent)..."
npx tsx prisma/seed.ts || echo "Seed skipped or already complete."

echo "==> Starting server (hot-reload via tsx watch)..."
exec npx tsx watch src/index.ts
