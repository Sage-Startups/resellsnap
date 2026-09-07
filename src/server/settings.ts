/**
 * Runtime application settings.
 *
 * Everything an operator might reasonably want to change without a redeploy
 * lives in the `app_setting` table. Defaults are declared here so a fresh
 * database is immediately usable and a missing row is never a crash.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface AppSettings {
  brandName: string;
  supportEmail: string;
  defaultCurrency: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  demoVisible: boolean;
  homepageAnnouncement: string;
  /** Global stop for AI generation during an incident. */
  aiGenerationEnabled: boolean;
  aiDailyCostLimitCents: number;
  maxPhotosPerItem: number;
  maxUploadBytes: number;
  /** Days a soft-deleted item remains recoverable. */
  deletedItemRetentionDays: number;
  failedUploadRetentionHours: number;
  exportArtifactRetentionHours: number;
  lowCreditThreshold: number;
  /** Minutes saved per generated listing, used by the "time saved" metric. */
  timeSavedMinutesPerListing: number;
  signupFreeCredits: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  brandName: 'ResellSnap AI',
  supportEmail: 'support@example.com',
  defaultCurrency: 'USD',
  maintenanceMode: false,
  maintenanceMessage: 'ResellSnap AI is briefly offline for maintenance. Please try again shortly.',
  demoVisible: true,
  homepageAnnouncement: '',
  aiGenerationEnabled: true,
  aiDailyCostLimitCents: 0,
  maxPhotosPerItem: 12,
  maxUploadBytes: 15 * 1024 * 1024,
  deletedItemRetentionDays: 30,
  failedUploadRetentionHours: 24,
  exportArtifactRetentionHours: 72,
  lowCreditThreshold: 3,
  timeSavedMinutesPerListing: 12,
  signupFreeCredits: 3,
};

export const SETTING_DESCRIPTIONS: Record<keyof AppSettings, string> = {
  brandName: 'Name shown in navigation, emails and page titles.',
  supportEmail: 'Reply-to address published on the contact and help pages.',
  defaultCurrency: 'ISO 4217 code used for new workspaces.',
  maintenanceMode: 'Shows a maintenance notice and blocks new AI jobs.',
  maintenanceMessage: 'Copy shown to customers while maintenance mode is on.',
  demoVisible: 'Controls whether the public /demo route is linked and reachable.',
  homepageAnnouncement: 'Optional banner shown above the marketing hero. Leave blank to hide.',
  aiGenerationEnabled: 'Global kill switch for AI generation during an incident.',
  aiDailyCostLimitCents: 'Estimated daily AI spend ceiling. 0 disables the circuit breaker.',
  maxPhotosPerItem: 'Upload ceiling per item.',
  maxUploadBytes: 'Maximum accepted size for a single photo, in bytes.',
  deletedItemRetentionDays: 'How long a soft-deleted item stays recoverable before purge.',
  failedUploadRetentionHours: 'How long orphaned uploads are kept before cleanup.',
  exportArtifactRetentionHours: 'Lifetime of generated export downloads.',
  lowCreditThreshold: 'Balance at or below which a low-credit email is sent.',
  timeSavedMinutesPerListing: 'Assumption behind the customer "time saved" metric.',
  signupFreeCredits: 'One-time credits granted to a brand new workspace.',
};

const CACHE_TTL_MS = 30_000;
let cache: { value: AppSettings; expires: number } | null = null;

export async function getSettings(): Promise<AppSettings> {
  if (cache && cache.expires > Date.now()) return cache.value;

  try {
    const rows = await prisma.appSetting.findMany();
    const merged: AppSettings = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      if (!(row.key in DEFAULT_SETTINGS)) continue;
      const key = row.key as keyof AppSettings;
      const expected = typeof DEFAULT_SETTINGS[key];
      const value = row.value;
      if (typeof value === expected) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (merged as any)[key] = value;
      }
    }

    cache = { value: merged, expires: Date.now() + CACHE_TTL_MS };
    return merged;
  } catch (error) {
    // A settings read must never take the site down; fall back to defaults.
    logger.error('Failed to load app settings; using defaults', { error });
    return { ...DEFAULT_SETTINGS };
  }
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  return (await getSettings())[key];
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    await prisma.appSetting.upsert({
      where: { key },
      create: {
        key,
        value: value as never,
        description: SETTING_DESCRIPTIONS[key as keyof AppSettings],
      },
      update: { value: value as never },
    });
  }
  invalidateSettingsCache();
  return getSettings();
}

export function invalidateSettingsCache(): void {
  cache = null;
}
