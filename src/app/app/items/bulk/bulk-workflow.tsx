'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Plus, RefreshCw, Trash2, Upload,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardContent, Field, Input, Select, Spinner,
} from '@/components/ui';
import {
  confirmUploadAction, createItemAction, getGenerationStatusAction,
  requestUploadTicketAction, saveSellerFactsAction, startGenerationAction,
} from '@/server/items/actions';
import { CATEGORY_HINTS, CONDITION_OPTIONS } from '@/server/items/facts';
import { cn } from '@/lib/utils';

interface BulkGroup {
  localId: string;
  name: string;
  itemId: string | null;
  files: File[];
  previews: string[];
  category: string;
  condition: string;
  defects: string;
  status: 'draft' | 'uploading' | 'queued' | 'running' | 'done' | 'failed';
  error: string | null;
  expanded: boolean;
}

/** Bounded so a big batch cannot swamp the queue or the seller's connection. */
const MAX_GROUPS = 20;
const CONCURRENCY = 3;

function newGroup(index: number): BulkGroup {
  return {
    localId: `group-${Date.now()}-${index}`,
    name: `Item ${index + 1}`,
    itemId: null,
    files: [],
    previews: [],
    category: '',
    condition: '',
    defects: '',
    status: 'draft',
    error: null,
    expanded: true,
  };
}

export function BulkWorkflow({
  maxPhotos,
  maxBytes,
  creditsAvailable,
}: {
  maxPhotos: number;
  maxBytes: number;
  creditsAvailable: number;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<BulkGroup[]>([newGroup(0)]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = groups.filter((group) => group.files.length > 0 && group.category && group.condition);
  const pending = groups.filter((group) => group.status === 'queued' || group.status === 'running');

  const update = useCallback((localId: string, patch: Partial<BulkGroup>) => {
    setGroups((current) =>
      current.map((group) => (group.localId === localId ? { ...group, ...patch } : group)),
    );
  }, []);

  // Poll only the groups still in flight; one failure never stalls the others.
  useEffect(() => {
    if (pending.length === 0) return;

    const timer = setInterval(async () => {
      for (const group of pending) {
        if (!group.itemId) continue;
        const result = await getGenerationStatusAction(group.itemId);
        if (!result.ok || !result.data) continue;

        if (result.data.itemStatus === 'READY') {
          update(group.localId, { status: 'done' });
        } else if (result.data.status === 'FAILED') {
          update(group.localId, {
            status: 'failed',
            error: result.data.error ?? 'Generation failed. Your credit was returned.',
          });
        } else if (result.data.status === 'RUNNING') {
          update(group.localId, { status: 'running' });
        }
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [pending, update]);

  async function processGroup(group: BulkGroup): Promise<void> {
    update(group.localId, { status: 'uploading', error: null });

    try {
      const created = await createItemAction();
      if (!created.ok || !created.data) throw new Error(created.error ?? 'Could not create the item.');
      const itemId = created.data.id;
      update(group.localId, { itemId });

      for (const file of group.files.slice(0, maxPhotos)) {
        const ticket = await requestUploadTicketAction({
          itemId,
          contentType: file.type,
          byteSize: file.size,
        });
        if (!ticket.ok || !ticket.data) throw new Error(ticket.error ?? 'Upload was refused.');

        const response = await fetch(ticket.data.url, {
          method: ticket.data.method,
          headers: ticket.data.headers,
          body: file,
        });
        if (!response.ok) throw new Error(`"${file.name}" failed to upload.`);

        await confirmUploadAction({ itemId, photoId: ticket.data.photoId });
      }

      // Photos must finish processing before analysis can start.
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const saved = await saveSellerFactsAction(itemId, {
        category: group.category,
        condition: group.condition,
        defects: group.defects || undefined,
        name: group.name,
        quantity: 1,
        shippingPreference: 'SHIPPING',
        country: 'US',
      });
      if (!saved.ok) throw new Error(saved.error ?? 'Could not save the details.');

      const started = await startGenerationAction({ itemId });
      if (!started.ok) throw new Error(started.error ?? 'Could not start generation.');

      update(group.localId, { status: 'queued' });
    } catch (caught) {
      update(group.localId, {
        status: 'failed',
        error: caught instanceof Error ? caught.message : 'Something went wrong.',
      });
    }
  }

  async function runBatch() {
    if (ready.length === 0) {
      setError('Add photos, a category and a condition to at least one group first.');
      return;
    }
    if (ready.length > creditsAvailable) {
      setError(
        `This batch needs ${ready.length} credits and you have ${creditsAvailable}. Reduce the batch or top up.`,
      );
      return;
    }

    setError(null);
    setRunning(true);

    // Bounded concurrency: a worker pool, not a stampede.
    const queue = [...ready];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) break;
        await processGroup(next);
      }
    });

    await Promise.all(workers);
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Alert tone="neutral">
        Each group becomes one item and uses one credit. A group that fails does not stop the rest,
        and every result still goes through the normal review screen before you publish or export.
      </Alert>

      <ul className="space-y-3">
        {groups.map((group, index) => (
          <li key={group.localId}>
            <Card className={cn(group.status === 'failed' && 'border-danger')}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => update(group.localId, { expanded: !group.expanded })}
                    aria-expanded={group.expanded}
                    className="rounded-md p-1 text-subtle hover:text-ink"
                    aria-label={group.expanded ? 'Collapse group' : 'Expand group'}
                  >
                    {group.expanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>

                  <Input
                    value={group.name}
                    onChange={(event) => update(group.localId, { name: event.target.value })}
                    aria-label={`Name for group ${index + 1}`}
                    className="h-8 max-w-56 flex-1"
                    disabled={group.status !== 'draft'}
                  />

                  <Badge tone="neutral">
                    {group.files.length} {group.files.length === 1 ? 'photo' : 'photos'}
                  </Badge>

                  <StatusBadge status={group.status} />

                  <div className="ml-auto flex items-center gap-1.5">
                    {group.status === 'failed' ? (
                      <Button size="sm" variant="outline" onClick={() => processGroup(group)}>
                        <RefreshCw />
                        Retry
                      </Button>
                    ) : null}

                    {group.status === 'done' && group.itemId ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/app/items/${group.itemId}`}>Review</Link>
                      </Button>
                    ) : null}

                    {group.status === 'draft' && groups.length > 1 ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove group ${index + 1}`}
                        onClick={() =>
                          setGroups((current) =>
                            current.filter((entry) => entry.localId !== group.localId),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </div>

                {group.error ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[12px] text-danger">
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                    {group.error}
                  </p>
                ) : null}

                {group.expanded && group.status === 'draft' ? (
                  <div className="mt-4 space-y-4 border-t border-stone-200 pt-4">
                    <div>
                      <label
                        htmlFor={`files-${group.localId}`}
                        className="mb-1.5 block text-[13px] font-medium text-ink"
                      >
                        Photos for this item
                      </label>
                      <input
                        id={`files-${group.localId}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="block w-full text-[13px] text-muted file:mr-3 file:rounded-lg file:border file:border-stone-300 file:bg-paper file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink"
                        onChange={(event) => {
                          const files = [...(event.target.files ?? [])]
                            .filter((file) => file.size <= maxBytes)
                            .slice(0, maxPhotos);
                          update(group.localId, {
                            files,
                            previews: files.map((file) => URL.createObjectURL(file)),
                          });
                        }}
                      />
                      {group.previews.length > 0 ? (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {group.previews.map((preview, previewIndex) => (
                            <li key={preview}>
                              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                              <img
                                src={preview}
                                alt={`Photo ${previewIndex + 1} for ${group.name}`}
                                className="size-14 rounded-lg border border-stone-200 object-cover"
                              />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Category" htmlFor={`category-${group.localId}`} required>
                        <Select
                          id={`category-${group.localId}`}
                          value={group.category}
                          onChange={(event) => update(group.localId, { category: event.target.value })}
                        >
                          <option value="">Choose…</option>
                          {CATEGORY_HINTS.map((hint) => (
                            <option key={hint.value} value={hint.value}>
                              {hint.label}
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <Field label="Condition" htmlFor={`condition-${group.localId}`} required>
                        <Select
                          id={`condition-${group.localId}`}
                          value={group.condition}
                          onChange={(event) =>
                            update(group.localId, { condition: event.target.value })
                          }
                        >
                          <option value="">Choose…</option>
                          {CONDITION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>

                    <Field label="Defects or damage" htmlFor={`defects-${group.localId}`}>
                      <Input
                        id={`defects-${group.localId}`}
                        value={group.defects}
                        onChange={(event) => update(group.localId, { defects: event.target.value })}
                        placeholder="Anything a buyer should know"
                      />
                    </Field>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          disabled={groups.length >= MAX_GROUPS || running}
          onClick={() => setGroups((current) => [...current, newGroup(current.length)])}
        >
          <Plus />
          Add another item
        </Button>

        <div className="flex items-center gap-3">
          <span className="text-[12px] text-muted">
            {ready.length} ready · uses {ready.length} of your {creditsAvailable} credits
          </span>
          <Button
            variant="primary"
            disabled={running || ready.length === 0}
            onClick={runBatch}
          >
            {running ? <Spinner /> : <Upload />}
            {running ? 'Processing…' : `Generate ${ready.length || ''}`.trim()}
          </Button>
        </div>
      </div>

      {groups.some((group) => group.status === 'done') ? (
        <Alert tone="success" title="Some drafts are ready">
          <p>
            Review each one before publishing or exporting — bulk mode does not skip the review
            step.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/app/inventory">Open inventory</Link>
          </Button>
        </Alert>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: BulkGroup['status'] }) {
  switch (status) {
    case 'uploading':
      return <Badge tone="info">Uploading</Badge>;
    case 'queued':
      return <Badge tone="info">Queued</Badge>;
    case 'running':
      return <Badge tone="info">Generating</Badge>;
    case 'done':
      return (
        <Badge tone="success">
          <CheckCircle2 className="size-3" aria-hidden="true" />
          Ready
        </Badge>
      );
    case 'failed':
      return <Badge tone="danger">Failed</Badge>;
    default:
      return <Badge tone="neutral">Draft</Badge>;
  }
}
