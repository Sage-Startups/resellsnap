'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, AlertTriangle, CheckCircle2, Download, ExternalLink, RefreshCw,
} from 'lucide-react';
import {
  Alert, Badge, Button, Field, Input, Select, Textarea,
} from '@/components/ui';
import { CharacterCounter } from './character-counter';
import { CopyButton } from './copy-button';
import { ExportMenu } from './export-menu';
import { PublishPanel } from './publish-panel';
import { regenerateVariantAction, updateVariantAction } from '@/server/items/actions';
import type { PlatformKey, Tone } from '@/lib/enums';
import { cn } from '@/lib/utils';

export interface VariantIssue {
  level: 'error' | 'warning';
  field: string;
  message: string;
}

export interface VariantData {
  platform: PlatformKey;
  platformName: string;
  sellerUrl: string;
  title: string;
  description: string;
  fields: Record<string, string | string[]>;
  issues: VariantIssue[];
  isComplete: boolean;
  titleMaxLength: number;
  descriptionMaxLength: number;
  maxHashtags: number;
  requiredFields: string[];
  guidance: string | null;
}

export interface PlatformCapabilityInfo {
  canPublish: boolean;
  state: string;
  badge: string;
  statusMessage: string;
  setupIssues: string[];
  connectionId?: string;
}

const TONES: Array<{ value: Tone; label: string }> = [
  { value: 'STRAIGHTFORWARD', label: 'Straightforward' },
  { value: 'FRIENDLY', label: 'Friendly' },
  { value: 'VINTAGE', label: 'Vintage' },
  { value: 'MINIMAL', label: 'Minimal' },
];

const FIELD_LABELS: Record<string, string> = {
  categorySuggestion: 'Suggested category',
  categoryId: 'Category ID',
  category: 'Category',
  conditionDescriptor: 'Condition',
  condition: 'Condition',
  itemSpecifics: 'Item specifics',
  hashtags: 'Hashtags',
  colour: 'Colour',
  pickupNotes: 'Pickup or delivery',
};

export function VariantEditor({
  itemId,
  variant,
  capability,
  tone,
  photoCount,
  hasPrice,
}: {
  itemId: string;
  variant: VariantData;
  capability: PlatformCapabilityInfo;
  tone: Tone;
  photoCount: number;
  hasPrice: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(variant.title);
  const [description, setDescription] = useState(variant.description);
  const [fields, setFields] = useState(variant.fields);
  const [issues, setIssues] = useState(variant.issues);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [regenerating, startRegenerate] = useTransition();
  const [selectedTone, setSelectedTone] = useState<Tone>(tone);
  const dirtyRef = useRef(false);

  // Reset only when the seller actually switches platform tab.
  //
  // Keying this on the whole `variant` object would re-run on every parent
  // render — `fields` and `issues` are fresh identities each time — and would
  // silently discard whatever the seller had typed but not yet saved.
  const platformRef = useRef(variant.platform);
  useEffect(() => {
    if (platformRef.current === variant.platform) return;
    platformRef.current = variant.platform;
    setTitle(variant.title);
    setDescription(variant.description);
    setFields(variant.fields);
    setIssues(variant.issues);
    dirtyRef.current = false;
    setSaveState('idle');
  }, [variant]);

  // Debounced autosave. The server re-validates and returns the authoritative
  // issue list, so the counters in the UI can never disagree with the rules.
  useEffect(() => {
    if (!dirtyRef.current) return;
    setSaveState('saving');

    const timer = setTimeout(async () => {
      const result = await updateVariantAction(itemId, variant.platform, {
        title,
        description,
        fields,
      });
      if (result.ok && result.data) {
        setIssues(result.data.issues as VariantIssue[]);
        setSaveState('saved');
        dirtyRef.current = false;
        setTimeout(() => setSaveState('idle'), 2000);
      } else {
        setSaveState('error');
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [title, description, fields, itemId, variant.platform]);

  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');

  const fullListing = [
    title,
    '',
    description,
    ...Object.entries(fields).map(
      ([key, value]) =>
        `${FIELD_LABELS[key] ?? key}: ${Array.isArray(value) ? value.join(' ') : value}`,
    ),
  ].join('\n');

  function touch<T>(setter: (value: T) => void) {
    return (value: T) => {
      dirtyRef.current = true;
      setter(value);
    };
  }

  return (
    <div className="space-y-5">
      {/* Capability banner — everything actionable derives from this */}
      <Alert
        tone={
          capability.badge === 'DIRECT_PUBLISHING'
            ? 'success'
            : capability.badge === 'TEMPORARILY_UNAVAILABLE'
              ? 'danger'
              : 'neutral'
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              capability.badge === 'DIRECT_PUBLISHING'
                ? 'accent'
                : capability.badge === 'TEMPORARILY_UNAVAILABLE'
                  ? 'danger'
                  : 'neutral'
            }
          >
            {capability.badge === 'DIRECT_PUBLISHING'
              ? 'Direct publishing available'
              : capability.badge === 'EXPORT_WORKFLOW'
                ? 'Export workflow'
                : capability.badge === 'APPROVED_ACCESS_REQUIRED'
                  ? 'Approved access required'
                  : 'Temporarily unavailable'}
          </Badge>
          <span className="text-[13px]">{capability.statusMessage}</span>
        </div>
      </Alert>

      {/* Validation */}
      {errors.length > 0 ? (
        <Alert tone="danger" title={`${errors.length} thing${errors.length === 1 ? '' : 's'} to fix`}>
          <ul className="mt-1 space-y-1">
            {errors.map((issue) => (
              <li key={`${issue.field}-${issue.message}`} className="flex gap-2">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {issue.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {warnings.length > 0 ? (
        <Alert tone="warning">
          <ul className="space-y-1">
            {warnings.map((issue) => (
              <li key={`${issue.field}-${issue.message}`} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {issue.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select
            value={selectedTone}
            onChange={(event) => setSelectedTone(event.target.value as Tone)}
            aria-label="Writing tone"
            className="h-8 w-44 text-[12px]"
          >
            {TONES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Button
            size="sm"
            variant="outline"
            disabled={regenerating}
            onClick={() =>
              startRegenerate(async () => {
                await regenerateVariantAction({
                  itemId,
                  platform: variant.platform,
                  tone: selectedTone,
                });
                // Give the worker a beat, then pick up the new copy.
                setTimeout(() => router.refresh(), 2500);
              })
            }
          >
            <RefreshCw className={regenerating ? 'animate-spin' : ''} />
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </Button>
          <span className="text-[11px] text-muted">Free — no credit used</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted" aria-live="polite">
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                  ? 'Could not save'
                  : ''}
          </span>
          {variant.isComplete && errors.length === 0 ? (
            <Badge tone="success">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              Ready
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Title */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor={`title-${variant.platform}`} className="text-[13px] font-medium text-ink">
            Title
          </label>
          <div className="flex items-center gap-2">
            <CharacterCounter value={title} max={variant.titleMaxLength} />
            <CopyButton value={title} label="Copy title" />
          </div>
        </div>
        <Input
          id={`title-${variant.platform}`}
          value={title}
          onChange={(event) => touch(setTitle)(event.target.value)}
          aria-invalid={title.length > variant.titleMaxLength}
        />
      </div>

      {/* Description */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label
            htmlFor={`description-${variant.platform}`}
            className="text-[13px] font-medium text-ink"
          >
            Description
          </label>
          <div className="flex items-center gap-2">
            <CharacterCounter value={description} max={variant.descriptionMaxLength} />
            <CopyButton value={description} label="Copy description" />
          </div>
        </div>
        <Textarea
          id={`description-${variant.platform}`}
          rows={10}
          value={description}
          onChange={(event) => touch(setDescription)(event.target.value)}
          aria-invalid={description.length > variant.descriptionMaxLength}
        />
      </div>

      {/* Platform fields */}
      {Object.keys(fields).length > 0 ? (
        <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-4">
          <h4 className="text-[13px] font-semibold text-ink">{variant.platformName} fields</h4>

          {Object.entries(fields).map(([key, value]) => {
            const isList = Array.isArray(value);
            const stringValue = isList ? (value as string[]).join(', ') : String(value);
            const required = variant.requiredFields.includes(key);

            return (
              <Field
                key={key}
                label={FIELD_LABELS[key] ?? key}
                htmlFor={`${variant.platform}-${key}`}
                required={required}
                hint={
                  key === 'hashtags' && variant.maxHashtags > 0
                    ? `Up to ${variant.maxHashtags}, comma separated.`
                    : key === 'hashtags'
                      ? 'This platform should not use hashtags.'
                      : undefined
                }
              >
                <div className="flex items-center gap-2">
                  <Input
                    id={`${variant.platform}-${key}`}
                    value={stringValue}
                    onChange={(event) =>
                      touch(setFields)({
                        ...fields,
                        [key]: isList
                          ? event.target.value
                              .split(',')
                              .map((entry) => entry.trim())
                              .filter(Boolean)
                          : event.target.value,
                      })
                    }
                  />
                  <CopyButton value={stringValue} label={`Copy ${FIELD_LABELS[key] ?? key}`} />
                </div>
              </Field>
            );
          })}
        </div>
      ) : null}

      {variant.guidance ? (
        <p className="text-[12px] leading-relaxed text-muted">{variant.guidance}</p>
      ) : null}

      {/* Actions */}
      <div className="flex flex-col gap-3 border-t border-stone-200 pt-4">
        {capability.canPublish ? (
          <PublishPanel
            itemId={itemId}
            platform={variant.platform}
            platformName={variant.platformName}
            connectionId={capability.connectionId}
            blocked={errors.length > 0 || !hasPrice || photoCount === 0}
            setupIssues={capability.setupIssues}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={fullListing} label="Copy whole listing" variant="button" />
          <ExportMenu itemId={itemId} platform={variant.platform} />
          <Button asChild variant="ghost" size="sm">
            <a href={variant.sellerUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Open {variant.platformName}
            </a>
          </Button>
        </div>

        {!capability.canPublish ? (
          <details className="rounded-lg border border-stone-200 bg-paper px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-medium text-ink">
              Posting this on {variant.platformName} — a 60-second checklist
            </summary>
            <ol className="mt-3 space-y-1.5">
              {[
                `Download the photo ZIP and open ${variant.platformName}.`,
                'Upload the photos — they are numbered in listing order.',
                'Copy the title, then the description.',
                'Fill in the platform fields shown above.',
                'Set your price, check everything, and post.',
                'Come back and mark the item as listed.',
              ].map((line, index) => (
                <li key={line} className="flex gap-2 text-[13px] leading-relaxed text-muted">
                  <span className="font-mono text-subtle">{index + 1}.</span>
                  {line}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>

      <p className={cn('text-[11px] leading-relaxed text-subtle')}>
        <Download className="mr-1 inline size-3" aria-hidden="true" />
        Exports expire after a short window and are only downloadable by you.
      </p>
    </div>
  );
}
