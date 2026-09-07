import type { Metadata } from 'next';
import { Card, CardContent } from '@/components/ui';
import { Section, SectionHeading } from '@/components/marketing/section';
import { getSettings } from '@/server/settings';
import { ContactForm } from './contact-form';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the ResellSnap AI team about the product, billing, integrations or your data.',
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const settings = await getSettings();

  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <SectionHeading
            eyebrow="Contact"
            title="Talk to a person"
            description="We read everything and reply within one working day."
          />

          <div className="mt-8 space-y-4">
            <Card>
              <CardContent className="p-5">
                <h2 className="text-[15px] font-semibold text-ink">Email</h2>
                <p className="mt-1.5 text-[13px] text-muted">
                  <a
                    href={`mailto:${settings.supportEmail}`}
                    className="underline underline-offset-4 hover:text-ink"
                  >
                    {settings.supportEmail}
                  </a>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h2 className="text-[15px] font-semibold text-ink">Security disclosure</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  Found a vulnerability? Email {settings.supportEmail} with &ldquo;Security&rdquo; in
                  the subject. Please give us a reasonable window to fix it before disclosing
                  publicly, and do not access data that is not yours while testing.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h2 className="text-[15px] font-semibold text-ink">Data requests</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  You can export or delete your account data from your settings page at any time. For
                  anything that needs a human, use the form with the &ldquo;Privacy or data&rdquo;
                  topic.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <ContactForm />
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
