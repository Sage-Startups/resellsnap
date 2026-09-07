import { Section } from './section';
import { Badge } from '@/components/ui';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export function LegalDocument({
  title,
  effectiveDate,
  version,
  summary,
  sections,
}: {
  title: string;
  effectiveDate: string;
  version: number;
  summary: string;
  sections: LegalSection[];
}) {
  return (
    <Section>
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Version {version}</Badge>
          <Badge tone="neutral">Effective {effectiveDate}</Badge>
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{summary}</p>

        <div className="rule my-8" />

        <nav aria-label="Contents" className="mb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Contents</h2>
          <ol className="mt-3 space-y-1.5">
            {sections.map((section, index) => (
              <li key={section.heading}>
                <a
                  href={`#section-${index + 1}`}
                  className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  {index + 1}. {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-9">
          {sections.map((section, index) => (
            <section key={section.heading} id={`section-${index + 1}`} className="scroll-mt-24">
              <h2 className="text-[17px] font-semibold text-ink">
                {index + 1}. {section.heading}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-3 text-[14px] leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mt-3 space-y-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet.slice(0, 40)} className="flex gap-2.5 text-[14px] leading-relaxed text-muted">
                      <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-stone-400" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </Section>
  );
}
