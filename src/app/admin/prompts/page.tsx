import type { Metadata } from 'next';
import { Alert, PageHeader } from '@/components/ui';
import { PromptStudio } from './prompt-studio';
import { prisma } from '@/lib/db';
import { hasRole, requireStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';
import { PROMPT_FIXTURES } from '@/server/admin/prompt-testing';

export const metadata: Metadata = { title: 'Prompt studio' };

export default async function AdminPromptsPage() {
  const actor = await requireStaff(Role.ADMIN);

  const templates = await prisma.promptTemplate.findMany({
    orderBy: { key: 'asc' },
    include: { versions: { orderBy: { version: 'desc' } } },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prompt studio"
        description="Edit, test and publish the prompts that produce every listing. Published versions are immutable and every generated result records the version that produced it."
      />

      <Alert tone="neutral">
        A draft never runs in production. Generation resolves the published version only — if a
        prompt has no published version, generation fails loudly rather than falling back to a draft.
      </Alert>

      <PromptStudio
        canPublish={hasRole(actor, Role.SUPER_ADMIN)}
        fixtures={PROMPT_FIXTURES.map((fixture) => ({
          id: fixture.id,
          label: fixture.label,
          description: fixture.description,
        }))}
        templates={templates.map((template) => ({
          id: template.id,
          key: template.key,
          name: template.name,
          description: template.description,
          publishedVersionId: template.publishedVersionId,
          versions: template.versions.map((version) => ({
            id: version.id,
            version: version.version,
            isPublished: version.isPublished,
            publishedAt: version.publishedAt?.toISOString() ?? null,
            notes: version.notes,
            createdAt: version.createdAt.toISOString(),
            systemPrompt: version.systemPrompt,
            userTemplate: version.userTemplate,
          })),
        }))}
      />
    </div>
  );
}
