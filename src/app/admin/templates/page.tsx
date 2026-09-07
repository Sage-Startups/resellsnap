import type { Metadata } from 'next';
import { Alert, PageHeader } from '@/components/ui';
import { TemplateEditor } from './template-editor';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';

export const metadata: Metadata = { title: 'Platform templates' };

export default async function AdminTemplatesPage() {
  await requireStaff(Role.ADMIN);

  const platforms = await prisma.platform.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { templates: { where: { isActive: true }, orderBy: { version: 'desc' }, take: 1 } },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform templates"
        description="Limits, required fields, tone rules and fee estimates for each marketplace. These are injected into generation as data, so changing them changes the output without a code deploy."
      />

      <Alert tone="neutral">
        Character limits are enforced twice: the generation prompt receives them as rules, and the
        server truncates and re-validates the result. A model that ignores a limit cannot produce an
        over-length listing.
      </Alert>

      <div className="space-y-4">
        {platforms.map((platform) => {
          const template = platform.templates[0];
          if (!template) return null;
          return (
            <TemplateEditor
              key={template.id}
              platformName={platform.name}
              template={{
                id: template.id,
                version: template.version,
                titleMaxLength: template.titleMaxLength,
                descriptionMaxLength: template.descriptionMaxLength,
                maxPhotos: template.maxPhotos,
                maxHashtags: template.maxHashtags,
                toneRules: template.toneRules,
                feePercentBps: template.feePercentBps,
                feeFixedCents: template.feeFixedCents,
                guidance: template.guidance,
                requiredFields: Array.isArray(template.requiredFields)
                  ? (template.requiredFields as string[])
                  : [],
                regions: Array.isArray(template.regions) ? (template.regions as string[]) : [],
                exportFormats: Array.isArray(template.exportFormats)
                  ? (template.exportFormats as string[])
                  : [],
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
