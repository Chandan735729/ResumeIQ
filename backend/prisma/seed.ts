import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const password = await bcrypt.hash('DevelopmentOnly123!', 12);
  const user = await prisma.user.upsert({
    where: { email: 'test@resumeiq.dev' },
    update: {},
    create: { email: 'test@resumeiq.dev', name: 'Test User', password },
  });

  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, plan: 'free', monthlyQuota: 5 },
  });
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
