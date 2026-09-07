'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea,
} from '@/components/ui';
import { updatePlatformTemplateAction } from '@/server/admin/actions';

export interface TemplateData {
  id: string;
  version: number;
  titleMaxLength: number;
  descriptionMaxLength: number;
  maxPhotos: number;
  maxHashtags: number;
  toneRules: string;
  feePercentBps: number;
  feeFixedCents: number;
  guidance: string | null;
  requiredFields: string[];
  regions: string[];
  exportFormats: string[];
}

export function TemplateEditor({
  platformName,
  template,
}: {
  platformName: string;
  template: TemplateData;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{platformName}</CardTitle>
        <span className="flex gap-1.5">
          <Badge tone="neutral">v{template.version}</Badge>
          {template.requiredFields.map((field) => (
            <Badge key={field} tone="neutral">
              {field}
            </Badge>
          ))}
        </span>
      </CardHeader>

      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await updatePlatformTemplateAction({
                templateId: template.id,
                titleMaxLength: Number(formData.get('titleMaxLength')),
                descriptionMaxLength: Number(formData.get('descriptionMaxLength')),
                maxPhotos: Number(formData.get('maxPhotos')),
                maxHashtags: Number(formData.get('maxHashtags')),
                toneRules: String(formData.get('toneRules')),
                feePercentBps: Number(formData.get('feePercentBps')),
                feeFixedCents: Number(formData.get('feeFixedCents')),
                guidance: String(formData.get('guidance')) || null,
              });
              if (result.ok) {
                setState('saved');
                setError(null);
                router.refresh();
                setTimeout(() => setState('idle'), 2500);
              } else {
                setState('error');
                setError(result.error ?? 'Could not save.');
              }
            });
          }}
        >
          {state === 'saved' ? <Alert tone="success">Template saved.</Alert> : null}
          {state === 'error' ? <Alert tone="danger">{error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Title limit" htmlFor={`title-${template.id}`}>
              <Input
                id={`title-${template.id}`}
                name="titleMaxLength"
                type="number"
                min={10}
                max={500}
                defaultValue={template.titleMaxLength}
              />
            </Field>
            <Field label="Description limit" htmlFor={`desc-${template.id}`}>
              <Input
                id={`desc-${template.id}`}
                name="descriptionMaxLength"
                type="number"
                min={100}
                defaultValue={template.descriptionMaxLength}
              />
            </Field>
            <Field label="Max photos" htmlFor={`photos-${template.id}`}>
              <Input
                id={`photos-${template.id}`}
                name="maxPhotos"
                type="number"
                min={1}
                max={50}
                defaultValue={template.maxPhotos}
              />
            </Field>
            <Field
              label="Max hashtags"
              htmlFor={`tags-${template.id}`}
              hint="0 means none at all."
            >
              <Input
                id={`tags-${template.id}`}
                name="maxHashtags"
                type="number"
                min={0}
                max={30}
                defaultValue={template.maxHashtags}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Estimated fee (basis points)"
              htmlFor={`fee-${template.id}`}
              hint={`${(template.feePercentBps / 100).toFixed(2)}% — shown to sellers as an estimate.`}
            >
              <Input
                id={`fee-${template.id}`}
                name="feePercentBps"
                type="number"
                min={0}
                max={10000}
                defaultValue={template.feePercentBps}
              />
            </Field>
            <Field
              label="Fixed fee (cents)"
              htmlFor={`fixed-${template.id}`}
            >
              <Input
                id={`fixed-${template.id}`}
                name="feeFixedCents"
                type="number"
                min={0}
                defaultValue={template.feeFixedCents}
              />
            </Field>
          </div>

          <Field
            label="Tone rules"
            htmlFor={`tone-${template.id}`}
            hint="Passed into the generation prompt verbatim, as data."
          >
            <Textarea
              id={`tone-${template.id}`}
              name="toneRules"
              rows={4}
              defaultValue={template.toneRules}
            />
          </Field>

          <Field
            label="Operator guidance"
            htmlFor={`guidance-${template.id}`}
            hint="Shown to sellers under the platform draft."
          >
            <Textarea
              id={`guidance-${template.id}`}
              name="guidance"
              rows={2}
              defaultValue={template.guidance ?? ''}
            />
          </Field>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="sm" disabled={pending}>
              <Save />
              {pending ? 'Saving…' : 'Save template'}
            </Button>
            <span className="text-[11px] text-muted">
              Regions: {template.regions.join(', ') || '—'} · Exports:{' '}
              {template.exportFormats.join(', ').toLowerCase()}
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
