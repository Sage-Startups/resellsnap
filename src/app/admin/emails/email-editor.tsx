'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Save, Send } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardContent, Checkbox, Field, Input, Textarea,
} from '@/components/ui';
import {
  previewEmailAction, sendTestEmailAction, updateEmailTemplateAction,
} from '@/server/admin/actions';

export function EmailTemplateEditor({
  template,
}: {
  template: {
    key: string;
    name: string;
    subject: string;
    body: string;
    isActive: boolean;
    isEssential: boolean;
    tokens: string[];
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[14px] font-medium text-ink">{template.name}</span>
            <span className="block truncate text-[12px] text-muted">{template.subject}</span>
          </span>
          <span className="flex shrink-0 gap-1.5">
            {template.isEssential ? <Badge tone="warning">essential</Badge> : null}
            <Badge tone={template.isActive ? 'success' : 'neutral'}>
              {template.isActive ? 'active' : 'disabled'}
            </Badge>
          </span>
        </button>

        {open ? (
          <div className="mt-4 space-y-3 border-t border-stone-200 pt-4">
            {message ? <Alert tone="success">{message}</Alert> : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}

            {template.isEssential ? (
              <Alert tone="neutral">
                This is an essential message. It ignores notification preferences, because a
                customer who cannot receive a password reset cannot recover their account.
              </Alert>
            ) : null}

            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                startTransition(async () => {
                  const result = await updateEmailTemplateAction({
                    key: template.key,
                    subject: String(formData.get('subject')),
                    body: String(formData.get('body')),
                    isActive: formData.get('isActive') === 'on',
                  });
                  if (result.ok) {
                    setMessage('Template saved.');
                    setError(null);
                    router.refresh();
                  } else {
                    setError(result.error ?? 'Could not save.');
                  }
                });
              }}
            >
              <Field label="Subject" htmlFor={`subject-${template.key}`} required>
                <Input
                  id={`subject-${template.key}`}
                  name="subject"
                  defaultValue={template.subject}
                  required
                />
              </Field>

              <Field
                label="Body"
                htmlFor={`body-${template.key}`}
                hint={`Available tokens: ${template.tokens.map((token) => `{{${token}}}`).join(', ')}. A paragraph containing only a link becomes the call-to-action button.`}
              >
                <Textarea
                  id={`body-${template.key}`}
                  name="body"
                  rows={10}
                  defaultValue={template.body}
                  className="font-mono text-[12px]"
                />
              </Field>

              <label className="flex items-center gap-2 text-[13px] text-ink">
                <Checkbox name="isActive" defaultChecked={template.isActive} />
                Active
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={pending}>
                  <Save />
                  Save
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await previewEmailAction(template.key);
                      if (result.ok && result.data) {
                        setPreview(result.data.html);
                        setError(null);
                      } else {
                        setError(result.error ?? 'Could not build a preview.');
                      }
                    })
                  }
                >
                  <Eye />
                  Preview
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await sendTestEmailAction(template.key);
                      if (result.ok) {
                        setMessage('Test email sent to your own address.');
                        setError(null);
                      } else {
                        setError(result.error ?? 'The test send failed.');
                      }
                    })
                  }
                >
                  <Send />
                  Send test to me
                </Button>
              </div>
            </form>

            {preview ? (
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-ink">Preview</p>
                {/* Sandboxed: the preview is our own rendered template, but an
                    iframe keeps its styles and any script out of the console. */}
                <iframe
                  title={`${template.name} preview`}
                  srcDoc={preview}
                  sandbox=""
                  className="h-96 w-full rounded-lg border border-stone-200 bg-white"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
