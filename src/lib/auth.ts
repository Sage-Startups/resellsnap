import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { prisma } from './db';
import { getEnv, isGoogleOAuthConfigured } from './env';
import { logger } from './logger';
import { provisionUser } from '@/server/provisioning';
import { EMAIL_KEYS, sendTemplateEmail } from '@/server/email';

const env = getEnv();

/**
 * Better Auth configuration.
 *
 * Email + password is the primary path with mandatory verification. Google is
 * wired only when both of its variables are present, so an unconfigured
 * deployment hides the button instead of showing a broken one.
 */
export const auth = betterAuth({
  appName: 'ResellSnap AI',
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],

  database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    autoSignIn: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      await sendTemplateEmail({
        key: EMAIL_KEYS.RESET_PASSWORD,
        to: user.email,
        userId: user.id,
        tokens: { name: user.name || 'there', actionUrl: url },
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendTemplateEmail({
        key: EMAIL_KEYS.VERIFY_EMAIL,
        to: user.email,
        userId: user.id,
        tokens: { name: user.name || 'there', actionUrl: url },
      });
    },
  },

  socialProviders: isGoogleOAuthConfigured()
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : {},

  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'USER', input: false },
      status: { type: 'string', defaultValue: 'ACTIVE', input: false },
    },
    changeEmail: { enabled: false },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  account: {
    accountLinking: { enabled: true, trustedProviders: ['google'] },
  },

  advanced: {
    useSecureCookies: env.isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction,
      path: '/',
    },
    cookiePrefix: 'resellsnap',
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await provisionUser({ id: user.id, email: user.email, name: user.name ?? '' });
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          try {
            await prisma.user.update({
              where: { id: session.userId },
              data: { lastSeenAt: new Date() },
            });
          } catch (error) {
            logger.warn('Could not update lastSeenAt', { error });
          }
        },
      },
    },
  },

  plugins: [nextCookies()],
});

export type Auth = typeof auth;
