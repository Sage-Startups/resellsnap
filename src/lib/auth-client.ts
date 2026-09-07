'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Browser auth client. The base URL is intentionally relative so the same build
 * works on a Railway preview domain and a custom domain without rebuilding.
 */
export const authClient = createAuthClient({ basePath: '/api/auth' });

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
