/**
 * Export builder.
 *
 * For platforms without approved direct publishing, this *is* the product's
 * delivery mechanism, so it is built to be genuinely fast to use: formatted
 * text ready to paste, a JSON/CSV payload for tooling, and a ZIP of the
 * photos in listing order with a README describing the item.
 */
import JSZip from 'jszip';
import { ExportFormat, ExportStatus, PlatformKey } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { logger, sanitizeError } from '@/lib/logger';
import { formatMoney } from '@/lib/money';
import { buildExportKey, getStorage } from '@/server/storage';
import { PLATFORM_NAMES } from '@/server/marketplace/registry';
import { getSettings } from '@/server/settings';

export interface ExportArtifact {
  filename: string;
  contentType: string;
  body: Buffer;
}

interface ExportContext {
  item: {
    id: string;
    sku: string;
    title: string;
    quantity: number;
    currency: string;
    workspaceId: string;
    shippingPreference: string;
    photos: Array<{ objectKey: string; contentType: string; position: number }>;
    facts: Array<{ key: string; value: string; confirmed: boolean; source: string }>;
  };
  listing: {
    title: string;
    description: string;
    conditionSummary: string;
    defectDisclosure: string | null;
    includedItems: string | null;
    measurements: string | null;
    attributes: Record<string, unknown>;
    searchTerms: string[];
  } | null;
  variant: {
    platform: PlatformKey;
    title: string;
    description: string;
    fields: Record<string, unknown>;
  } | null;
  priceCents: number | null;
}

async function loadContext(itemId: string, platform: PlatformKey | null): Promise<ExportContext | null> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      photos: { where: { status: 'PROCESSED' }, orderBy: { position: 'asc' } },
      facts: true,
      listing: { include: { variants: true } },
      priceSuggestions: true,
    },
  });

  if (!item) return null;

  const variant = platform
    ? (item.listing?.variants.find((entry) => entry.platform === platform) ?? null)
    : null;

  const balanced =
    item.priceSuggestions.find((suggestion) => suggestion.strategy === 'BALANCED') ??
    item.priceSuggestions[0] ??
    null;

  return {
    item: {
      id: item.id,
      sku: item.sku,
      title: item.title,
      quantity: item.quantity,
      currency: item.currency,
      workspaceId: item.workspaceId,
      shippingPreference: item.shippingPreference,
      photos: item.photos.map((photo) => ({
        objectKey: photo.objectKey,
        contentType: photo.contentType,
        position: photo.position,
      })),
      facts: item.facts.map((fact) => ({
        key: fact.key,
        value: fact.value,
        confirmed: fact.confirmed,
        source: fact.source,
      })),
    },
    listing: item.listing
      ? {
          title: item.listing.title,
          description: item.listing.description,
          conditionSummary: item.listing.conditionSummary,
          defectDisclosure: item.listing.defectDisclosure,
          includedItems: item.listing.includedItems,
          measurements: item.listing.measurements,
          attributes: (item.listing.attributes ?? {}) as Record<string, unknown>,
          searchTerms: Array.isArray(item.listing.searchTerms)
            ? (item.listing.searchTerms as string[])
            : [],
        }
      : null,
    variant: variant
      ? {
          platform: variant.platform,
          title: variant.title,
          description: variant.description,
          fields: (variant.fields ?? {}) as Record<string, unknown>,
        }
      : null,
    priceCents: balanced?.amountCents ?? null,
  };
}

/** Plain text, laid out for copy-and-paste into a marketplace form. */
export function buildTextExport(context: ExportContext, brandName: string): string {
  const platformName = context.variant ? PLATFORM_NAMES[context.variant.platform] : 'Master listing';
  const title = context.variant?.title ?? context.listing?.title ?? context.item.title;
  const description = context.variant?.description ?? context.listing?.description ?? '';

  const lines: string[] = [
    `${platformName} listing — ${context.item.sku}`,
    '='.repeat(60),
    '',
    'TITLE',
    title,
    '',
    'DESCRIPTION',
    description,
    '',
  ];

  if (context.priceCents !== null) {
    lines.push('PRICE', formatMoney(context.priceCents, context.item.currency), '');
  }

  lines.push('QUANTITY', String(context.item.quantity), '');

  if (context.listing?.conditionSummary) {
    lines.push('CONDITION', context.listing.conditionSummary, '');
  }
  if (context.listing?.defectDisclosure) {
    lines.push('DEFECTS TO DISCLOSE', context.listing.defectDisclosure, '');
  }
  if (context.listing?.includedItems) {
    lines.push('INCLUDED', context.listing.includedItems, '');
  }
  if (context.listing?.measurements) {
    lines.push('MEASUREMENTS', context.listing.measurements, '');
  }

  const fieldEntries = Object.entries(context.variant?.fields ?? {});
  if (fieldEntries.length > 0) {
    lines.push(`${platformName.toUpperCase()} FIELDS`);
    for (const [key, value] of fieldEntries) {
      lines.push(`${humanize(key)}: ${Array.isArray(value) ? value.join(' ') : String(value)}`);
    }
    lines.push('');
  }

  if (context.listing?.searchTerms.length) {
    lines.push('SEARCH TERMS', context.listing.searchTerms.join(', '), '');
  }

  lines.push(
    '-'.repeat(60),
    `Prepared by ${brandName}. Review every field before you publish — you remain`,
    'responsible for the accuracy of your listing and for marketplace policy compliance.',
  );

  return lines.join('\n');
}

export function buildJsonExport(context: ExportContext): string {
  return JSON.stringify(
    {
      sku: context.item.sku,
      platform: context.variant?.platform ?? 'MASTER',
      title: context.variant?.title ?? context.listing?.title ?? context.item.title,
      description: context.variant?.description ?? context.listing?.description ?? '',
      priceCents: context.priceCents,
      currency: context.item.currency,
      quantity: context.item.quantity,
      condition: context.listing?.conditionSummary ?? null,
      defectDisclosure: context.listing?.defectDisclosure ?? null,
      includedItems: context.listing?.includedItems ?? null,
      measurements: context.listing?.measurements ?? null,
      attributes: context.listing?.attributes ?? {},
      searchTerms: context.listing?.searchTerms ?? [],
      platformFields: context.variant?.fields ?? {},
      photoCount: context.item.photos.length,
      exportedAt: new Date().toISOString(),
      disclaimer:
        'Generated by ResellSnap AI. Copy is a suggestion, not a guarantee. Verify accuracy before publishing.',
    },
    null,
    2,
  );
}

export function toCsvRow(values: Array<string | number | null>): string {
  return values
    .map((value) => {
      if (value === null || value === undefined) return '';
      const text = String(value);
      // Prefix formula-leading characters so a spreadsheet cannot execute them.
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    })
    .join(',');
}

export function buildCsvExport(context: ExportContext): string {
  const header = [
    'sku',
    'platform',
    'title',
    'description',
    'price',
    'currency',
    'quantity',
    'condition',
    'defects',
    'included',
    'measurements',
    'search_terms',
  ];

  const row = [
    context.item.sku,
    context.variant?.platform ?? 'MASTER',
    context.variant?.title ?? context.listing?.title ?? context.item.title,
    context.variant?.description ?? context.listing?.description ?? '',
    context.priceCents === null ? '' : (context.priceCents / 100).toFixed(2),
    context.item.currency,
    context.item.quantity,
    context.listing?.conditionSummary ?? '',
    context.listing?.defectDisclosure ?? '',
    context.listing?.includedItems ?? '',
    context.listing?.measurements ?? '',
    (context.listing?.searchTerms ?? []).join('; '),
  ];

  return `${toCsvRow(header)}\n${toCsvRow(row)}\n`;
}

async function buildPhotoZip(context: ExportContext, brandName: string): Promise<Buffer> {
  const zip = new JSZip();
  const storage = getStorage();

  const folder = zip.folder(context.item.sku) ?? zip;

  for (const [index, photo] of context.item.photos.entries()) {
    try {
      const data = await storage.getObject(photo.objectKey);
      const extension = photo.contentType === 'image/png' ? 'png' : photo.contentType === 'image/webp' ? 'webp' : 'jpg';
      // Numbered so the listing order survives the download.
      folder.file(`${String(index + 1).padStart(2, '0')}.${extension}`, data);
    } catch (error) {
      logger.warn('Skipping a photo that could not be read for export', {
        itemId: context.item.id,
        error,
      });
    }
  }

  folder.file('listing.txt', buildTextExport(context, brandName));
  folder.file('listing.json', buildJsonExport(context));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function buildExportArtifact(input: {
  itemId: string;
  platform: PlatformKey | null;
  format: ExportFormat;
}): Promise<ExportArtifact | null> {
  const context = await loadContext(input.itemId, input.platform);
  if (!context) return null;

  const settings = await getSettings();
  const slug = `${context.item.sku}${input.platform ? `-${input.platform.toLowerCase()}` : ''}`;

  switch (input.format) {
    case ExportFormat.TEXT:
      return {
        filename: `${slug}.txt`,
        contentType: 'text/plain; charset=utf-8',
        body: Buffer.from(buildTextExport(context, settings.brandName), 'utf8'),
      };
    case ExportFormat.JSON:
      return {
        filename: `${slug}.json`,
        contentType: 'application/json; charset=utf-8',
        body: Buffer.from(buildJsonExport(context), 'utf8'),
      };
    case ExportFormat.CSV:
      return {
        filename: `${slug}.csv`,
        contentType: 'text/csv; charset=utf-8',
        body: Buffer.from(buildCsvExport(context), 'utf8'),
      };
    case ExportFormat.PHOTO_ZIP:
      return {
        filename: `${slug}-photos.zip`,
        contentType: 'application/zip',
        body: await buildPhotoZip(context, settings.brandName),
      };
    default:
      return null;
  }
}

/** Runs an `ExportJob` to completion, storing the artifact privately. */
export async function runExportJob(exportJobId: string): Promise<void> {
  const job = await prisma.exportJob.findUnique({ where: { id: exportJobId } });
  if (!job || !job.itemId) return;

  await prisma.exportJob.update({
    where: { id: exportJobId },
    data: { status: ExportStatus.BUILDING },
  });

  try {
    const artifact = await buildExportArtifact({
      itemId: job.itemId,
      platform: job.platform,
      format: job.format,
    });

    if (!artifact) throw new Error('The item could not be loaded for export.');

    const settings = await getSettings();
    const objectKey = buildExportKey(job.workspaceId, exportJobId, artifact.filename);
    await getStorage().putObject(objectKey, artifact.body, artifact.contentType);

    await prisma.$transaction([
      prisma.downloadArtifact.create({
        data: {
          exportJobId,
          objectKey,
          filename: artifact.filename,
          contentType: artifact.contentType,
          byteSize: artifact.body.byteLength,
          expiresAt: new Date(Date.now() + settings.exportArtifactRetentionHours * 3600_000),
        },
      }),
      prisma.exportJob.update({ where: { id: exportJobId }, data: { status: ExportStatus.READY } }),
      prisma.analyticsEvent.create({
        data: {
          name: 'LISTING_EXPORTED',
          workspaceId: job.workspaceId,
          properties: { platform: job.platform ?? 'MASTER', format: job.format },
        },
      }),
    ]);
  } catch (error) {
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: { status: ExportStatus.FAILED, error: sanitizeError(error, 'Export failed') },
    });
    throw error;
  }
}

function humanize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase());
}
