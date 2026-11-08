#!/bin/sh
set -e

export DATABASE_URL="${DATABASE_URL:-file:/app/data/prod.db}"

echo "[entrypoint] prisma db push..."
npx prisma db push --skip-generate

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "[entrypoint] seeding admin (idempotent)..."
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  const email = process.env.ADMIN_EMAIL || 'admin@rechargealert.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.admin.upsert({
    where: { email },
    create: { email, passwordHash },
    update: { passwordHash },
  });
  console.log('Admin ready:', email);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
NODE
fi

echo "[entrypoint] starting API..."
exec node dist/index.js
