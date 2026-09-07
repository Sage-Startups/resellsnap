import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { ContentEditor } from './content-editor';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';

export const metadata: Metadata = { title: 'Content' };

export default async function AdminContentPage() {
  await requireStaff(Role.ADMIN);

  const blocks = await prisma.contentBlock.findMany({
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
  });

  const grouped = {
    announcement: blocks.filter((block) => block.category === 'announcement'),
    faq: blocks.filter((block) => block.category === 'faq'),
    legal: blocks.filter((block) => block.category === 'legal'),
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Content"
        description="The homepage announcement, the public FAQ, and version metadata for the legal documents."
      />

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Homepage announcement
        </h2>
        <div className="space-y-3">
          {grouped.announcement.map((block) => (
            <ContentEditor
              key={block.key}
              block={{
                key: block.key,
                title: block.title,
                body: block.body,
                isActive: block.isActive,
                version: block.version,
              }}
              bodyLabel="Announcement text"
              bodyHint="Shown as a banner above the marketing hero. Leave inactive to hide it."
              rows={2}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Public FAQ
        </h2>
        <div className="space-y-3">
          {grouped.faq.map((block) => (
            <ContentEditor
              key={block.key}
              block={{
                key: block.key,
                title: block.title,
                body: block.body,
                isActive: block.isActive,
                version: block.version,
              }}
              titleLabel="Question"
              bodyLabel="Answer"
              rows={4}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Legal document versions
        </h2>
        <p className="mb-3 text-[13px] text-muted">
          The documents themselves are rendered from the application source so they stay under
          version control. These records track the published version and effective date.
        </p>
        <div className="space-y-3">
          {grouped.legal.map((block) => (
            <ContentEditor
              key={block.key}
              block={{
                key: block.key,
                title: block.title,
                body: block.body,
                isActive: block.isActive,
                version: block.version,
              }}
              titleLabel="Document"
              bodyLabel="Version notes"
              rows={2}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
