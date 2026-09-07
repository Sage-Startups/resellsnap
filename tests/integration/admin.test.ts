/**
 * Admin authorization and audit integration tests.
 *
 * The product promise is that permissions are enforced on the server, not
 * hidden in the UI, and that every staff mutation leaves an audit trail with a
 * reason. So these tests call the server actions directly — exactly as a
 * crafted request would, with no page or button involved — and assert both
 * halves: the mutation is refused for the wrong role, and when it is allowed it
 * writes an audit entry naming the actor and the reason.
 *
 * Only the session is mocked. Role and status are re-read from the real
 * database by `getCurrentUser`, so the authorization logic under test is the
 * real one.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreditBucket, Role, UserStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';

/** The user id the mocked session resolves to for the next action call. */
let sessionUserId: string | null = null;

vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'vitest-admin-suite' }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => (sessionUserId ? { user: { id: sessionUserId } } : null),
      revokeUserSessions: async () => undefined,
      forgetPassword: async () => undefined,
    },
  },
}));

const {
  adjustCreditsAction,
  setUserRoleAction,
  setUserStatusAction,
  addSupportNoteAction,
} = await import('@/server/admin/actions');

const { createTestWorkspace, destroyTestWorkspace, ensureReferenceData } = await import(
  '../helpers/db'
);
type TestWorkspace = Awaited<ReturnType<typeof createTestWorkspace>>;

const created: TestWorkspace[] = [];

beforeAll(async () => {
  await ensureReferenceData();
});

beforeEach(async () => {
  // Rate limits are per actor and persist; clear them so a suite of mutations
  // does not trip the limiter and mask an authorization result.
  await prisma.rateLimit.deleteMany({});
});

afterEach(async () => {
  sessionUserId = null;
  await Promise.all(created.splice(0).map(destroyTestWorkspace));
});

async function actorWithRole(role: Role) {
  const workspace = await createTestWorkspace();
  created.push(workspace);
  await prisma.user.update({ where: { id: workspace.userId }, data: { role } });
  return workspace;
}

async function subject() {
  const workspace = await createTestWorkspace({ purchasedCredits: 5 });
  created.push(workspace);
  return workspace;
}

function actAs(userId: string | null) {
  sessionUserId = userId;
}

async function auditEntriesFor(targetId: string) {
  return prisma.auditLog.findMany({ where: { targetId }, orderBy: { createdAt: 'desc' } });
}

describe('admin authorization is enforced on the server', () => {
  it('refuses an anonymous caller', async () => {
    const target = await subject();
    actAs(null);

    const result = await adjustCreditsAction({
      workspaceId: target.workspaceId,
      amount: 100,
      bucket: CreditBucket.PURCHASED,
      reason: 'Trying it on',
    });

    expect(result.ok).toBe(false);
    const after = await prisma.workspace.findUniqueOrThrow({
      where: { id: target.workspaceId },
      select: { purchasedCredits: true },
    });
    expect(after.purchasedCredits).toBe(5);
  });

  it('refuses an ordinary signed-in user', async () => {
    const ordinary = await actorWithRole(Role.USER);
    const target = await subject();
    actAs(ordinary.userId);

    const result = await adjustCreditsAction({
      workspaceId: target.workspaceId,
      amount: 100,
      bucket: CreditBucket.PURCHASED,
      reason: 'Self-serve credits',
    });

    expect(result.ok).toBe(false);
    const after = await prisma.workspace.findUniqueOrThrow({
      where: { id: target.workspaceId },
      select: { purchasedCredits: true },
    });
    expect(after.purchasedCredits).toBe(5);
    expect(await auditEntriesFor(target.workspaceId)).toHaveLength(0);
  });

  it('refuses a support agent the super-admin-only role change', async () => {
    const support = await actorWithRole(Role.SUPPORT);
    const target = await subject();
    actAs(support.userId);

    const result = await setUserRoleAction({
      userId: target.userId,
      role: Role.SUPER_ADMIN,
      reason: 'Promoting myself a friend',
    });

    expect(result.ok).toBe(false);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(after.role).toBe(Role.USER);
  });

  it('refuses a suspended admin, whatever their role says', async () => {
    const admin = await actorWithRole(Role.ADMIN);
    await prisma.user.update({
      where: { id: admin.userId },
      data: { status: UserStatus.SUSPENDED },
    });
    const target = await subject();
    actAs(admin.userId);

    const result = await adjustCreditsAction({
      workspaceId: target.workspaceId,
      amount: 100,
      bucket: CreditBucket.PURCHASED,
      reason: 'Still have my role',
    });

    expect(result.ok).toBe(false);
  });

  it('reflects a role revoked mid-session on the very next request', async () => {
    const admin = await actorWithRole(Role.ADMIN);
    const target = await subject();
    actAs(admin.userId);

    const allowed = await adjustCreditsAction({
      workspaceId: target.workspaceId,
      amount: 10,
      bucket: CreditBucket.PURCHASED,
      reason: 'Goodwill gesture',
    });
    expect(allowed.ok).toBe(true);

    // The session token is unchanged; only the database row changed.
    await prisma.user.update({ where: { id: admin.userId }, data: { role: Role.USER } });

    const refused = await adjustCreditsAction({
      workspaceId: target.workspaceId,
      amount: 10,
      bucket: CreditBucket.PURCHASED,
      reason: 'One more',
    });
    expect(refused.ok).toBe(false);

    const after = await prisma.workspace.findUniqueOrThrow({
      where: { id: target.workspaceId },
      select: { purchasedCredits: true },
    });
    expect(after.purchasedCredits).toBe(15);
  });
});

describe('admin mutations are audited', () => {
  it('records the actor, reason and before/after of a credit adjustment', async () => {
    const admin = await actorWithRole(Role.ADMIN);
    const target = await subject();
    actAs(admin.userId);

    const result = await adjustCreditsAction({
      workspaceId: target.workspaceId,
      amount: 25,
      bucket: CreditBucket.PURCHASED,
      reason: 'Compensating a failed generation',
    });

    expect(result.ok).toBe(true);

    const entries = await auditEntriesFor(target.workspaceId);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorId).toBe(admin.userId);
    expect(entries[0]?.reason).toBe('Compensating a failed generation');
    expect(entries[0]?.ipAddress).toBe('203.0.113.7');

    // The ledger keeps the same reason, so support and finance agree.
    const ledger = await prisma.creditLedger.findFirst({
      where: { workspaceId: target.workspaceId, kind: 'ADMIN_GRANT' },
    });
    expect(ledger?.reason).toBe('Compensating a failed generation');
    expect(ledger?.actorId).toBe(admin.userId);
  });

  it('refuses a credit adjustment with no reason and writes nothing', async () => {
    const admin = await actorWithRole(Role.ADMIN);
    const target = await subject();
    actAs(admin.userId);

    const result = await adjustCreditsAction({
      workspaceId: target.workspaceId,
      amount: 25,
      bucket: CreditBucket.PURCHASED,
      reason: '   ',
    });

    expect(result.ok).toBe(false);
    expect(await auditEntriesFor(target.workspaceId)).toHaveLength(0);
    const after = await prisma.workspace.findUniqueOrThrow({
      where: { id: target.workspaceId },
      select: { purchasedCredits: true },
    });
    expect(after.purchasedCredits).toBe(5);
  });

  it('records a role change with its before and after values', async () => {
    const superAdmin = await actorWithRole(Role.SUPER_ADMIN);
    const target = await subject();
    actAs(superAdmin.userId);

    const result = await setUserRoleAction({
      userId: target.userId,
      role: Role.SUPPORT,
      reason: 'New support hire',
    });

    expect(result.ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.userId } })).role).toBe(
      Role.SUPPORT,
    );

    const entries = await auditEntriesFor(target.userId);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.beforeData).toMatchObject({ role: Role.USER });
    expect(entries[0]?.afterData).toMatchObject({ role: Role.SUPPORT });
    expect(entries[0]?.reason).toBe('New support hire');
  });

  it('stops a super admin from changing their own role', async () => {
    const superAdmin = await actorWithRole(Role.SUPER_ADMIN);
    actAs(superAdmin.userId);

    const result = await setUserRoleAction({
      userId: superAdmin.userId,
      role: Role.USER,
      reason: 'Demoting myself by accident',
    });

    expect(result.ok).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: superAdmin.userId } })).role).toBe(
      Role.SUPER_ADMIN,
    );
  });

  it('audits a suspension with the reason shown to the customer', async () => {
    const admin = await actorWithRole(Role.ADMIN);
    const target = await subject();
    actAs(admin.userId);

    const result = await setUserStatusAction({
      userId: target.userId,
      status: UserStatus.SUSPENDED,
      reason: 'Repeated prohibited-item uploads',
    });

    expect(result.ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(after.status).toBe(UserStatus.SUSPENDED);
    expect(after.suspendedReason).toBe('Repeated prohibited-item uploads');

    const entries = await auditEntriesFor(target.userId);
    expect(entries[0]?.actorId).toBe(admin.userId);
  });

  it('lets support add a note without granting them credit powers', async () => {
    const support = await actorWithRole(Role.SUPPORT);
    const target = await subject();
    actAs(support.userId);

    const note = await addSupportNoteAction({
      userId: target.userId,
      body: 'Customer asked about eBay connection status.',
    });
    expect(note.ok).toBe(true);

    const credits = await adjustCreditsAction({
      workspaceId: target.workspaceId,
      amount: 50,
      bucket: CreditBucket.PURCHASED,
      reason: 'While I am here',
    });
    expect(credits.ok).toBe(false);

    const after = await prisma.workspace.findUniqueOrThrow({
      where: { id: target.workspaceId },
      select: { purchasedCredits: true },
    });
    expect(after.purchasedCredits).toBe(5);
  });
});
