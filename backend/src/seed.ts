import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from './utils/prisma';

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@rechargealert.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.admin.upsert({
    where: { email },
    create: { email, passwordHash },
    update: { passwordHash },
  });

  console.log(`Admin ready: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
