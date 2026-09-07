/**
 * Server-side authorization.
 *
 * Every read and every mutation in the customer app and admin area goes through
 * one of these helpers. Hiding a button in the UI is a courtesy; this file is
 * the actual boundary.
 */
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Role, UserStatus, WorkspaceRole } from '@/generated/prisma/enums';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: Role;
  status: UserStatus;
}

export interface WorkspaceContext {
  user: SessionUser;
  workspace: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    timezone: string;
    country: string;
    isDemo: boolean;
    monthlyCredits: number;
    purchasedCredits: number;
    onboardingState: Record<string, unknown>;
  };
  membershipRole: WorkspaceRole;
}

export class AuthorizationError extends Error {
  readonly status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.status = status;
  }
}

/**
 * Reads the current session. Deduplicated per request by `React.cache` so a
 * page rendering ten server components performs one lookup.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  // Re-read from the database rather than trusting the session payload: role
  // and suspension changes must take effect on the next request, not the next
  // login.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      status: true,
    },
  });

  return user ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.status === UserStatus.SUSPENDED) redirect('/login?error=suspended');
  if (!user.emailVerified) redirect('/verify-email?pending=1');
  return user;
}

/** For route handlers, which throw rather than redirect. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError('Authentication required', 401);
  if (user.status === UserStatus.SUSPENDED) throw new AuthorizationError('Account suspended', 403);
  if (!user.emailVerified) throw new AuthorizationError('Email verification required', 403);
  return user;
}

const ROLE_RANK: Record<Role, number> = {
  [Role.USER]: 0,
  [Role.SUPPORT]: 1,
  [Role.ADMIN]: 2,
  [Role.SUPER_ADMIN]: 3,
};

export function hasRole(user: { role: Role }, minimum: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[minimum];
}

export function isStaff(user: { role: Role }): boolean {
  return hasRole(user, Role.SUPPORT);
}

/** Page guard for `/admin/**`. Ordinary users are sent to the customer app. */
export async function requireStaff(minimum: Role = Role.SUPPORT): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user, minimum)) redirect('/app');
  return user;
}

export async function requireApiStaff(minimum: Role = Role.SUPPORT): Promise<SessionUser> {
  const user = await requireApiUser();
  if (!hasRole(user, minimum)) throw new AuthorizationError('Insufficient permissions', 403);
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  return requireStaff(Role.SUPER_ADMIN);
}

/**
 * Resolves the caller's workspace *and* proves membership in the same query.
 * There is no code path that loads a workspace by id from a request parameter.
 */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { deletedAt: null } },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
          timezone: true,
          country: true,
          isDemo: true,
          monthlyCredits: true,
          purchasedCredits: true,
          onboardingState: true,
        },
      },
    },
  });

  if (!membership) return null;

  return {
    user,
    membershipRole: membership.role,
    workspace: {
      ...membership.workspace,
      onboardingState: (membership.workspace.onboardingState ?? {}) as Record<string, unknown>,
    },
  };
});

export async function requireWorkspace(): Promise<WorkspaceContext> {
  await requireUser();
  const context = await getWorkspaceContext();
  if (!context) redirect('/login');
  return context;
}

export async function requireApiWorkspace(): Promise<WorkspaceContext> {
  await requireApiUser();
  const context = await getWorkspaceContext();
  if (!context) throw new AuthorizationError('No workspace for this account', 403);
  return context;
}

/**
 * Asserts an item belongs to the caller's workspace.
 *
 * Used by every item route. Returns the item id so callers cannot accidentally
 * proceed with an unvalidated one.
 */
export async function assertItemInWorkspace(itemId: string, workspaceId: string): Promise<string> {
  const item = await prisma.item.findFirst({
    where: { id: itemId, workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!item) throw new AuthorizationError('Item not found in this workspace', 404);
  return item.id;
}

/** Request metadata for audit rows. Best-effort; never blocks a mutation. */
export async function requestMetadata(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get('x-forwarded-for');
    return {
      ipAddress: forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : headerList.get('x-real-ip'),
      userAgent: headerList.get('user-agent'),
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}
