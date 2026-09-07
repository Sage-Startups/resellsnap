'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Alert, Badge, Button, Card, CardContent, Checkbox, Field, Input, Textarea } from '@/components/ui';
import { updateContentBlockAction } from '@/server/admin/actions';

export function ContentEditor({
  block,
  titleLabel = 'Title',
  bodyLabel = 'Body',
  bodyHint,
  rows = 3,
}: {
  block: { key: string; title: string | null; body: string; isActive: boolean; version: number };
  titleLabel?: string;
  bodyLabel?: string;
  bodyHint?: string;
  rows?: number;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="p-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await updateContentBlockAction({
                key: block.key,
                title: String(formData.get('title')) || null,
                body: String(formData.get('body')),
                isActive: formData.get('isActive') === 'on',
              });
              if (result.ok) {
                setSaved(true);
                setError(null);
                router.refresh();
                setTimeout(() => setSaved(false), 2500);
              } else {
                setError(result.error ?? 'Could not save.');
              }
            });
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <code className="text-[11px] text-subtle">{block.key}</code>
            <Badge tone="neutral">v{block.version}</Badge>
          </div>

          {saved ? <Alert tone="success">Saved.</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <Field label={titleLabel} htmlFor={`title-${block.key}`}>
            <Input id={`title-${block.key}`} name="title" defaultValue={block.title ?? ''} />
          </Field>

          <Field label={bodyLabel} htmlFor={`body-${block.key}`} hint={bodyHint}>
            <Textarea
              id={`body-${block.key}`}
              name="body"
              rows={rows}
              defaultValue={block.body}
            />
          </Field>

          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <Checkbox name="isActive" defaultChecked={block.isActive} />
              Published
            </label>
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              <Save />
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
