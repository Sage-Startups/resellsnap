/**
 * Idempotent super-admin bootstrap.
 *
 * Promotes the account matching `SUPER_ADMIN_EMAIL` to `SUPER_ADMIN`. It never
 * creates a user and never sets a password — the person signs up through the
 * normal flow first. There is deliberately no universal admin credential
 * anywhere in this product.
 *
 * Usage: SUPER_ADMIN_EMAIL=you@example.com pnpm bootstrap:admin
 */
import 'dotenv/config';
import { Role } from '../src/generated/prisma/enums';
import { prisma, disconnectPrisma } from '../src/lib/db';

async function main(): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

  if (!email) {
    console.error('SUPER_ADMIN_EMAIL is not set. Nothing to do.');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  if (!user) {
    console.error(
      [
        `No account exists for ${email}.`,
        '',
        'Register that address through the normal sign-up flow first, then run this',
        'command again. This tool only changes a role; it never creates an account',
        'and never sets a password.',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (user.role === Role.SUPER_ADMIN) {
    console.log(`${email} is already a super admin. No change made.`);
    return;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { role: Role.SUPER_ADMIN } }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'user.role_changed',
        targetType: 'user',
        targetId: user.id,
        reason: 'Bootstrapped from SUPER_ADMIN_EMAIL via CLI',
        beforeData: { role: user.role },
        afterData: { role: Role.SUPER_ADMIN },
      },
    }),
  ]);

  console.log(`Promoted ${email} to SUPER_ADMIN.`);
}

main()
  .catch((error) => {
    console.error('Bootstrap failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
