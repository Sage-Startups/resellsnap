/**
 * Database seed.
 *
 * Idempotent by design: run it as many times as you like. It seeds the
 * operational configuration a fresh deployment needs (platforms, plans,
 * prompts, email templates, settings, flags, content) and, unless
 * `SEED_SAMPLE_DATA=false`, the fictional "North & Found Resale" workspace used
 * by the marketing screenshots and the admin walkthrough.
 *
 * It never creates an admin password and never seeds real customer data.
 */
import 'dotenv/config';
import {
  ConfidenceLevel,
  CreditBucket,
  CreditEntryKind,
  type FactSource,
  ItemStatus,
  PhotoStatus,
  PlatformKey,
  PriceSource,
  PriceStrategy,
  Tone,
  UserStatus,
} from '../src/generated/prisma/enums';
import { prisma, disconnectPrisma } from '../src/lib/db';
import { PLATFORM_SEEDS } from '../src/server/marketplace/registry';
import { PLAN_SEEDS } from '../src/server/plans';
import { PROMPT_DEFINITIONS } from '../src/server/ai/prompts';
import { EMAIL_DEFINITIONS } from '../src/server/email/templates';
import { DEFAULT_SETTINGS, SETTING_DESCRIPTIONS } from '../src/server/settings';
import { DEFAULT_CATEGORY_HEURISTICS } from '../src/server/pricing/engine';
import { buildPhotoKey, buildDerivativeKey, getStorage } from '../src/server/storage';
import { renderMockup, renderMockupWebp } from './fixtures/mockups';
import { DEMO_ITEMS, DEMO_MONTHLY_METRICS, DEMO_WORKSPACE_NAME } from './fixtures/demo-items';

const log = (message: string) => console.log(`  ${message}`);

// ---------------------------------------------------------------------------

async function seedPlatforms(): Promise<void> {
  for (const seed of PLATFORM_SEEDS) {
    const platform = await prisma.platform.upsert({
      where: { key: seed.key },
      create: {
        key: seed.key,
        name: seed.name,
        sellerUrl: seed.sellerUrl,
        sortOrder: seed.sortOrder,
      },
      update: { name: seed.name, sellerUrl: seed.sellerUrl, sortOrder: seed.sortOrder },
    });

    await prisma.platformCapability.upsert({
      where: { platformId: platform.id },
      create: {
        platformId: platform.id,
        ...seed.capabilities,
        unavailableReason: seed.unavailableReason,
      },
      // Capabilities are operator-controlled after the first seed; do not
      // silently reset an admin's deliberate change on redeploy.
      update: { unavailableReason: seed.unavailableReason },
    });

    const existingTemplate = await prisma.platformTemplate.findFirst({
      where: { platformId: platform.id, version: 1 },
    });

    if (!existingTemplate) {
      await prisma.platformTemplate.create({
        data: {
          platformId: platform.id,
          version: 1,
          isActive: true,
          titleMaxLength: seed.template.titleMaxLength,
          descriptionMaxLength: seed.template.descriptionMaxLength,
          maxPhotos: seed.template.maxPhotos,
          maxHashtags: seed.template.maxHashtags,
          requiredFields: seed.template.requiredFields,
          toneRules: seed.template.toneRules,
          feePercentBps: seed.template.feePercentBps,
          feeFixedCents: seed.template.feeFixedCents,
          exportFormats: seed.template.exportFormats,
          regions: seed.template.regions,
          guidance: seed.template.guidance,
        },
      });
    }
  }
  log(`platforms: ${PLATFORM_SEEDS.length} configured`);
}

async function seedPlans(): Promise<void> {
  for (const seed of PLAN_SEEDS) {
    const stripePriceId = seed.stripePriceEnv ? (process.env[seed.stripePriceEnv] ?? null) : null;

    const plan = await prisma.plan.upsert({
      where: { key: seed.key },
      create: {
        key: seed.key,
        name: seed.name,
        kind: seed.kind,
        tagline: seed.tagline,
        description: seed.description,
        priceCents: seed.priceCents,
        interval: seed.interval,
        creditsGranted: seed.creditsGranted,
        stripePriceId,
        isDefault: seed.isDefault,
        sortOrder: seed.sortOrder,
        features: seed.features,
      },
      // Price IDs come from the environment on every deploy; display copy is
      // admin-owned and is not overwritten.
      update: { stripePriceId },
    });

    for (const [key, value] of Object.entries(seed.entitlements)) {
      await prisma.planEntitlement.upsert({
        where: { planId_key: { planId: plan.id, key } },
        create: {
          planId: plan.id,
          key,
          boolValue: typeof value === 'boolean' ? value : null,
          intValue: typeof value === 'number' ? value : null,
          stringValue: typeof value === 'string' ? value : null,
        },
        update: {},
      });
    }
  }
  log(`plans: ${PLAN_SEEDS.length} configured`);
}

async function seedPrompts(): Promise<void> {
  for (const definition of PROMPT_DEFINITIONS) {
    const template = await prisma.promptTemplate.upsert({
      where: { key: definition.key },
      create: { key: definition.key, name: definition.name, description: definition.description },
      update: { name: definition.name, description: definition.description },
    });

    const existing = await prisma.promptVersion.findUnique({
      where: { templateId_version: { templateId: template.id, version: 1 } },
    });

    if (!existing) {
      const version = await prisma.promptVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          systemPrompt: definition.systemPrompt,
          userTemplate: definition.userTemplate,
          outputSchema: definition.outputSchema as never,
          notes: 'Initial published version, seeded with the application.',
          isPublished: true,
          publishedAt: new Date(),
        },
      });
      await prisma.promptTemplate.update({
        where: { id: template.id },
        data: { publishedVersionId: version.id },
      });
    } else if (!template.publishedVersionId) {
      await prisma.promptTemplate.update({
        where: { id: template.id },
        data: { publishedVersionId: existing.id },
      });
    }
  }
  log(`prompts: ${PROMPT_DEFINITIONS.length} templates with a published version`);
}

async function seedEmailTemplates(): Promise<void> {
  for (const definition of EMAIL_DEFINITIONS) {
    await prisma.emailTemplate.upsert({
      where: { key: definition.key },
      create: {
        key: definition.key,
        name: definition.name,
        subject: definition.subject,
        body: definition.body,
        isEssential: definition.isEssential,
      },
      // Admin edits to subject/body are preserved across deploys.
      update: { name: definition.name, isEssential: definition.isEssential },
    });
  }
  log(`emails: ${EMAIL_DEFINITIONS.length} templates`);
}

async function seedSettings(): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.appSetting.upsert({
      where: { key },
      create: {
        key,
        value: value as never,
        description: SETTING_DESCRIPTIONS[key as keyof typeof SETTING_DESCRIPTIONS],
      },
      update: { description: SETTING_DESCRIPTIONS[key as keyof typeof SETTING_DESCRIPTIONS] },
    });
  }

  await prisma.appSetting.upsert({
    where: { key: 'categoryHeuristics' },
    create: {
      key: 'categoryHeuristics',
      value: DEFAULT_CATEGORY_HEURISTICS as never,
      description:
        'Admin-maintained fallback price guidelines by category. Used only when no marketplace or seller-history data exists.',
    },
    update: {},
  });

  // Support email follows the environment unless an admin has overridden it.
  if (process.env.SUPPORT_EMAIL) {
    await prisma.appSetting.upsert({
      where: { key: 'supportEmail' },
      create: {
        key: 'supportEmail',
        value: process.env.SUPPORT_EMAIL as never,
        description: SETTING_DESCRIPTIONS.supportEmail,
      },
      update: {},
    });
  }

  log(`settings: ${Object.keys(DEFAULT_SETTINGS).length + 1} keys`);
}

const FEATURE_FLAGS = [
  { key: 'bulk_workflow', description: 'Bulk listing workflow at /app/items/bulk.', enabled: true, planKeys: ['pro'] },
  { key: 'ebay_direct_publish', description: 'Allow direct publishing to eBay when a workspace is connected.', enabled: true, planKeys: ['starter', 'pro'] },
  { key: 'public_demo', description: 'Expose the no-login interactive demo at /demo.', enabled: true, planKeys: [] },
  { key: 'admin_impersonation', description: 'Allow super admins to open a short-lived, audited read-only view of a customer account.', enabled: false, planKeys: [] },
  { key: 'ai_price_estimates', description: 'Allow the AI fallback when no comparables or heuristics apply.', enabled: true, planKeys: [] },
];

async function seedFeatureFlags(): Promise<void> {
  for (const flag of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: { key: flag.key, description: flag.description, enabled: flag.enabled, planKeys: flag.planKeys },
      update: { description: flag.description },
    });
  }
  log(`feature flags: ${FEATURE_FLAGS.length}`);
}

const FAQ_ENTRIES = [
  {
    key: 'faq_accuracy',
    title: 'How accurate is the AI?',
    body: 'It is good at describing what is visible in a photograph and poor at knowing what is not. It will read a shape, a colour, a visible label and obvious wear. It cannot authenticate an item, verify a size, confirm a model number or see hidden damage. Every inference is shown with a confidence level and the photo it came from, and nothing becomes a stated fact until you confirm it.',
  },
  {
    key: 'faq_photos',
    title: 'What happens to my photos?',
    body: 'They are stored privately in our own object storage and are only ever served through short-lived signed links. Location and camera metadata is stripped before permanent storage. Photos are sent to our AI provider to produce your analysis, and are deleted when you delete the item.',
  },
  {
    key: 'faq_credits',
    title: 'How do credits work?',
    body: 'One credit covers a full run: analysing your photos, writing the master listing and generating all four platform drafts. Editing, copying, exporting and regenerating an individual platform draft cost nothing. If a generation fails after our retries, the credit goes back automatically.',
  },
  {
    key: 'faq_connections',
    title: 'Can it post to every marketplace for me?',
    body: 'eBay, yes — through the official eBay Sell APIs, after you connect your account and confirm each listing. Vinted, Depop and Facebook Marketplace do not offer approved third-party listing creation, so we prepare everything for a fast copy-and-paste instead. We will not scrape those sites or automate your browser, because that puts your seller account at risk.',
  },
  {
    key: 'faq_pricing',
    title: 'Where do the price suggestions come from?',
    body: 'In this order: official marketplace data where we have approved access, then your own completed sales, then a maintained category guideline, and finally an AI estimate based only on your confirmed attributes. Each suggestion tells you which of those it used and how confident it is. We never invent comparable sales.',
  },
  {
    key: 'faq_cancel',
    title: 'Can I cancel?',
    body: 'Yes, from the billing page, at any time. Your plan runs to the end of the period you have paid for. Credits you bought separately stay in your account, and your listings, photos and history remain accessible.',
  },
];

async function seedContent(): Promise<void> {
  for (const [index, entry] of FAQ_ENTRIES.entries()) {
    await prisma.contentBlock.upsert({
      where: { key: entry.key },
      create: { key: entry.key, title: entry.title, body: entry.body, category: 'faq', sortOrder: index },
      update: {},
    });
  }

  await prisma.contentBlock.upsert({
    where: { key: 'homepage_announcement' },
    create: {
      key: 'homepage_announcement',
      title: 'Homepage announcement',
      body: '',
      category: 'announcement',
      isActive: false,
    },
    update: {},
  });

  for (const document of [
    { key: 'legal_terms', title: 'Terms of Service', version: 1 },
    { key: 'legal_privacy', title: 'Privacy Policy', version: 1 },
    { key: 'legal_acceptable_use', title: 'Acceptable Use Policy', version: 1 },
  ]) {
    await prisma.contentBlock.upsert({
      where: { key: document.key },
      create: {
        key: document.key,
        title: document.title,
        body: 'Rendered from the application source. This record tracks the published version and effective date.',
        category: 'legal',
        version: document.version,
        effectiveAt: new Date('2026-01-01T00:00:00Z'),
      },
      update: {},
    });
  }

  log(`content: ${FAQ_ENTRIES.length} FAQ entries, 3 legal documents`);
}

// --- Sample workspace ------------------------------------------------------

async function seedSampleWorkspace(): Promise<void> {
  const email = 'sample-seller@northandfound.example';

  const existing = await prisma.workspace.findUnique({ where: { slug: 'north-and-found-resale' } });
  if (existing) {
    log('sample workspace: already present, skipping');
    return;
  }

  // A demo account with no password: it exists to hold sample data for
  // screenshots and the admin walkthrough, and cannot be signed into.
  const user = await prisma.user.create({
    data: {
      name: 'Sample Seller',
      email,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      preference: { create: {} },
      notificationPref: { create: {} },
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: DEMO_WORKSPACE_NAME,
      slug: 'north-and-found-resale',
      isDemo: true,
      currency: 'USD',
      members: { create: { userId: user.id, role: 'OWNER' } },
      subscription: { create: { status: 'NONE' } },
      onboardingState: { photosUploaded: true, factsConfirmed: true, listingGenerated: true },
    },
  });

  await prisma.creditLedger.create({
    data: {
      workspaceId: workspace.id,
      kind: CreditEntryKind.SIGNUP_GRANT,
      bucket: CreditBucket.PURCHASED,
      delta: 25,
      balanceAfter: 25,
      reason: 'Sample data workspace',
      idempotencyKey: `signup:${workspace.id}`,
    },
  });
  await prisma.workspace.update({ where: { id: workspace.id }, data: { purchasedCredits: 25 } });

  const storage = getStorage();
  const platforms = await prisma.platform.findMany();
  const platformIdByKey = new Map(platforms.map((platform) => [platform.key, platform.id]));

  for (const fixture of DEMO_ITEMS) {
    const item = await prisma.item.create({
      data: {
        workspaceId: workspace.id,
        createdById: user.id,
        sku: fixture.sku,
        title: fixture.master.title,
        status: ItemStatus.READY,
        categoryHint: fixture.categoryHint,
        quantity: fixture.quantity,
        acquisitionCostCents: fixture.acquisitionCostCents,
        currency: 'USD',
        country: 'US',
        notes: 'Sample data — not a real item.',
      },
    });

    // Photos: original generated mockups, stored exactly like a real upload.
    for (const [index, angle] of (['front', 'detail', 'back'] as const).entries()) {
      const spec = { id: fixture.mockupId, label: fixture.name, tint: '#8d8577', shape: shapeFor(fixture.mockupId), angle };
      const original = await renderMockup(spec);
      const thumbnail = await renderMockupWebp(spec, 480);

      const objectKey = buildPhotoKey(workspace.id, item.id, 'jpg');
      const thumbnailKey = buildDerivativeKey(objectKey, 'thumb');

      await storage.putObject(objectKey, original, 'image/jpeg');
      await storage.putObject(thumbnailKey, thumbnail, 'image/webp');

      const photo = await prisma.itemPhoto.create({
        data: {
          itemId: item.id,
          status: PhotoStatus.PROCESSED,
          objectKey,
          thumbnailKey,
          contentType: 'image/jpeg',
          byteSize: original.byteLength,
          width: 1200,
          height: 1200,
          position: index,
          blurScore: 0.85,
          brightness: 0.72,
          exifStripped: true,
        },
      });

      if (index === 0) {
        await prisma.item.update({ where: { id: item.id }, data: { coverPhotoId: photo.id } });
      }
    }

    for (const fact of fixture.facts) {
      await prisma.itemFact.create({
        data: {
          itemId: item.id,
          key: fact.key,
          value: fact.value,
          source: fact.source as FactSource,
          confidence: (fact.confidence ?? null) as ConfidenceLevel | null,
          evidence: fact.evidence ?? null,
          confirmed: fact.confirmed,
        },
      });
    }

    const listing = await prisma.listing.create({
      data: {
        itemId: item.id,
        tone: Tone.STRAIGHTFORWARD,
        title: fixture.master.title,
        description: fixture.master.description,
        conditionSummary: fixture.master.conditionSummary,
        defectDisclosure: fixture.master.defectDisclosure,
        includedItems: fixture.master.includedItems,
        measurements: fixture.master.measurements,
        attributes: fixture.master.attributes,
        searchTerms: fixture.master.searchTerms,
      },
    });

    for (const variant of fixture.variants) {
      await prisma.listingVariant.create({
        data: {
          listingId: listing.id,
          platform: variant.platform,
          title: variant.title,
          description: variant.description,
          fields: variant.fields,
          tone: Tone.STRAIGHTFORWARD,
          isComplete: true,
          issues: [],
          templateVersion: 1,
        },
      });
    }

    const priceRows: Array<[PriceStrategy, number]> = [
      [PriceStrategy.QUICK_SALE, fixture.prices.quickSaleCents],
      [PriceStrategy.BALANCED, fixture.prices.balancedCents],
      [PriceStrategy.MAXIMISE_RETURN, fixture.prices.maximiseReturnCents],
    ];

    for (const [strategy, amountCents] of priceRows) {
      await prisma.priceSuggestion.create({
        data: {
          itemId: item.id,
          strategy,
          amountCents,
          currency: 'USD',
          source: PriceSource.ADMIN_HEURISTIC,
          confidence: ConfidenceLevel.LOW,
          explanation: fixture.prices.explanation,
          comparableCount: 0,
        },
      });
    }

    await prisma.listingStatusEvent.create({
      data: { itemId: item.id, toStatus: ItemStatus.READY, source: 'system', note: 'Sample data' },
    });

    void platformIdByKey;
  }

  await seedSampleMetrics(workspace.id);
  log(`sample workspace: "${DEMO_WORKSPACE_NAME}" with ${DEMO_ITEMS.length} items`);
}

function shapeFor(id: string): 'trainer' | 'jacket' | 'machine' | 'camera' {
  switch (id) {
    case 'trainers':
      return 'trainer';
    case 'jacket':
      return 'jacket';
    case 'espresso':
      return 'machine';
    default:
      return 'camera';
  }
}

/**
 * Three months of the sample seller's operating history.
 *
 * Written as real `Item` and `SaleRecord` rows so the analytics pages exercise
 * the same queries a live workspace would, rather than reading a hard-coded
 * table. Every item is flagged with a sample note.
 */
async function seedSampleMetrics(workspaceId: string): Promise<void> {
  const now = new Date();
  const platforms = [PlatformKey.EBAY, PlatformKey.VINTED, PlatformKey.DEPOP, PlatformKey.FACEBOOK_MARKETPLACE];
  let sequence = 100;

  for (const month of DEMO_MONTHLY_METRICS) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - month.monthOffset, 1);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();

    const averageSaleCents = Math.round(month.grossCents / month.sold);

    for (let index = 0; index < month.generated; index += 1) {
      sequence += 1;
      const createdAt = new Date(monthStart);
      createdAt.setDate(1 + Math.floor((index / month.generated) * (daysInMonth - 1)));

      const isSold = index < month.sold;
      const isPublished = index < month.publishedOrExported;
      const platform = platforms[index % platforms.length] as PlatformKey;

      const status = isSold
        ? ItemStatus.SOLD
        : isPublished
          ? ItemStatus.LISTED
          : ItemStatus.READY;

      // Vary the sale price around the month's average so the analytics charts
      // are not a flat line, while the monthly total still matches the table.
      const variance = 1 + ((index % 7) - 3) * 0.08;
      const salePriceCents = Math.max(500, Math.round(averageSaleCents * variance));

      const item = await prisma.item.create({
        data: {
          workspaceId,
          sku: `RS-SMP-${String(sequence).padStart(4, '0')}`,
          title: `Sample item ${sequence}`,
          status,
          categoryHint: ['clothing', 'shoes', 'electronics', 'home_kitchen'][index % 4],
          quantity: 1,
          currency: 'USD',
          acquisitionCostCents: Math.round(salePriceCents * 0.35),
          createdAt,
          updatedAt: createdAt,
          listedAt: isPublished ? createdAt : null,
          notes: 'Sample data — generated to populate the analytics views.',
        },
      });

      await prisma.analyticsEvent.create({
        data: {
          name: 'LISTING_GENERATED',
          workspaceId,
          properties: { sample: true },
          createdAt,
        },
      });

      if (isPublished) {
        await prisma.analyticsEvent.create({
          data: {
            name: 'LISTING_EXPORTED',
            workspaceId,
            properties: { sample: true, platform },
            createdAt,
          },
        });
      }

      if (isSold) {
        // Clamp inside the month so the monthly totals match the published
        // sample table exactly rather than spilling into the next period.
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 0, 0);
        const soldAt = new Date(
          Math.min(createdAt.getTime() + (3 + (index % 18)) * 86_400_000, monthEnd.getTime()),
        );
        await prisma.item.update({ where: { id: item.id }, data: { soldAt } });
        await prisma.saleRecord.create({
          data: {
            itemId: item.id,
            workspaceId,
            platform,
            currency: 'USD',
            salePriceCents,
            feesCents: Math.round(salePriceCents * 0.12),
            shippingCents: 450,
            soldAt,
            isApiSynced: false,
          },
        });
      }
    }
  }

  // Reconcile the sale totals with the published sample table exactly.
  for (const month of DEMO_MONTHLY_METRICS) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - month.monthOffset, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - month.monthOffset + 1, 1);

    const sales = await prisma.saleRecord.findMany({
      where: { workspaceId, soldAt: { gte: monthStart, lt: monthEnd } },
      orderBy: { createdAt: 'asc' },
    });

    if (sales.length === 0) continue;
    const total = sales.reduce((sum, sale) => sum + sale.salePriceCents, 0);
    const difference = month.grossCents - total;
    const last = sales[sales.length - 1];

    if (last && difference !== 0) {
      await prisma.saleRecord.update({
        where: { id: last.id },
        data: { salePriceCents: Math.max(100, last.salePriceCents + difference) },
      });
    }
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Seeding ResellSnap AI…');

  await seedPlatforms();
  await seedPlans();
  await seedPrompts();
  await seedEmailTemplates();
  await seedSettings();
  await seedFeatureFlags();
  await seedContent();

  if (process.env.SEED_SAMPLE_DATA !== 'false') {
    await seedSampleWorkspace();
  } else {
    log('sample workspace: skipped (SEED_SAMPLE_DATA=false)');
  }

  console.log('\nSeed complete.');
  console.log('Next: register your account, then run `pnpm bootstrap:admin` with SUPER_ADMIN_EMAIL set.');
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
