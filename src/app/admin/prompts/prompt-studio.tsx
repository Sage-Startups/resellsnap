'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, History, Save, Upload } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardContent, Field, Select, Textarea,
} from '@/components/ui';
import { ConfirmAction } from '@/components/admin/confirm-action';
import {
  publishPromptVersionAction, rollbackPromptVersionAction,
  savePromptDraftAction, testPromptAction,
} from '@/server/admin/actions';
import { relativeTime } from '@/lib/utils';

export interface PromptVersionSummary {
  id: string;
  version: number;
  isPublished: boolean;
  publishedAt: string | null;
  notes: string | null;
  createdAt: string;
  systemPrompt: string;
  userTemplate: string;
}

export interface PromptTemplateSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  publishedVersionId: string | null;
  versions: PromptVersionSummary[];
}

export interface FixtureSummary {
  id: string;
  label: string;
  description: string;
}

/**
 * The prompt studio.
 *
 * The rule this UI enforces: a published version is immutable, and a draft
 * cannot run in production. An admin edits a draft, tests it against
 * non-customer fixtures, and then explicitly publishes it — at which point
 * every subsequent generation records that version id.
 */
export function PromptStudio({
  templates,
  fixtures,
  canPublish,
}: {
  templates: PromptTemplateSummary[];
  fixtures: FixtureSummary[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const template = templates.find((entry) => entry.id === templateId) ?? templates[0];

  const published = template?.versions.find((v) => v.id === template.publishedVersionId);
  const [versionId, setVersionId] = useState<string>(published?.id ?? template?.versions[0]?.id ?? '');
  const version = template?.versions.find((entry) => entry.id === versionId);

  const [systemPrompt, setSystemPrompt] = useState(version?.systemPrompt ?? '');
  const [userTemplate, setUserTemplate] = useState(version?.userTemplate ?? '');
  const [notes, setNotes] = useState(version?.notes ?? '');
  const [dirty, setDirty] = useState(false);

  const [fixtureId, setFixtureId] = useState(fixtures[0]?.id ?? '');
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function selectVersion(nextId: string) {
    const next = template?.versions.find((entry) => entry.id === nextId);
    setVersionId(nextId);
    setSystemPrompt(next?.systemPrompt ?? '');
    setUserTemplate(next?.userTemplate ?? '');
    setNotes(next?.notes ?? '');
    setDirty(false);
    setTestOutput(null);
  }

  function selectTemplate(nextId: string) {
    const next = templates.find((entry) => entry.id === nextId);
    setTemplateId(nextId);
    const target = next?.versions.find((v) => v.id === next.publishedVersionId) ?? next?.versions[0];
    setVersionId(target?.id ?? '');
    setSystemPrompt(target?.systemPrompt ?? '');
    setUserTemplate(target?.userTemplate ?? '');
    setNotes(target?.notes ?? '');
    setDirty(false);
    setTestOutput(null);
  }

  if (!template) return <Alert tone="warning">No prompt templates are seeded.</Alert>;

  const isPublishedVersion = version?.isPublished ?? false;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prompt" htmlFor="prompt-template">
                <Select
                  id="prompt-template"
                  value={templateId}
                  onChange={(event) => selectTemplate(event.target.value)}
                >
                  {templates.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Version" htmlFor="prompt-version">
                <Select
                  id="prompt-version"
                  value={versionId}
                  onChange={(event) => selectVersion(event.target.value)}
                >
                  {template.versions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      v{entry.version}
                      {entry.id === template.publishedVersionId ? ' — live' : ''}
                      {entry.isPublished && entry.id !== template.publishedVersionId
                        ? ' — published'
                        : ''}
                      {!entry.isPublished ? ' — draft' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {template.description ? (
              <p className="mt-3 text-[12px] leading-relaxed text-muted">{template.description}</p>
            ) : null}
          </CardContent>
        </Card>

        {message ? <Alert tone="success">{message}</Alert> : null}

        {isPublishedVersion ? (
          <Alert tone="neutral">
            This version is published and therefore immutable. Editing it creates a new draft, which
            is what keeps every generated listing attributable to exact prompt text.
          </Alert>
        ) : null}

        <Card>
          <CardContent className="p-4 space-y-4">
            <Field
              label="System prompt"
              htmlFor="system-prompt"
              hint="The rules. Includes the safety preamble that treats image text as data, never as instructions."
            >
              <Textarea
                id="system-prompt"
                rows={16}
                value={systemPrompt}
                onChange={(event) => {
                  setSystemPrompt(event.target.value);
                  setDirty(true);
                }}
                className="font-mono text-[12px]"
              />
            </Field>

            <Field
              label="User template"
              htmlFor="user-template"
              hint="Uses {{token}} placeholders. Values are inserted as labelled data blocks."
            >
              <Textarea
                id="user-template"
                rows={8}
                value={userTemplate}
                onChange={(event) => {
                  setUserTemplate(event.target.value);
                  setDirty(true);
                }}
                className="font-mono text-[12px]"
              />
            </Field>

            <Field label="Notes" htmlFor="prompt-notes" hint="Why this version exists.">
              <Textarea
                id="prompt-notes"
                rows={2}
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                  setDirty(true);
                }}
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={pending || !dirty}
                onClick={() =>
                  startTransition(async () => {
                    const result = await savePromptDraftAction({
                      templateId: template.id,
                      // Editing a published version always forks a new draft.
                      versionId: isPublishedVersion ? undefined : versionId,
                      systemPrompt,
                      userTemplate,
                      notes,
                    });
                    if (result.ok && result.data) {
                      setMessage(
                        isPublishedVersion
                          ? `Saved as a new draft (v${result.data.version}).`
                          : 'Draft saved.',
                      );
                      setDirty(false);
                      router.refresh();
                    } else {
                      setMessage(null);
                      setTestError(result.error ?? 'Could not save.');
                    }
                  })
                }
              >
                <Save />
                {isPublishedVersion ? 'Save as new draft' : 'Save draft'}
              </Button>

              {canPublish && version && !version.isPublished ? (
                <ConfirmAction
                  label="Publish this version"
                  title="Publish this prompt version?"
                  description="Every generation from this moment uses this exact text, and each result records this version id. The currently live version stays available for rollback."
                  targetName={`${template.name} v${version.version}`}
                  confirmLabel="Publish"
                  variant="primary"
                  onConfirm={async (reason) =>
                    publishPromptVersionAction({ versionId: version.id, reason })
                  }
                />
              ) : null}

              {canPublish &&
              version?.isPublished &&
              version.id !== template.publishedVersionId ? (
                <ConfirmAction
                  label="Roll back to this version"
                  title="Roll back to this version?"
                  description="New generations will use this version instead of the currently live one. Nothing already generated changes."
                  targetName={`${template.name} v${version.version}`}
                  confirmLabel="Roll back"
                  variant="danger"
                  onConfirm={async (reason) =>
                    rollbackPromptVersionAction({
                      templateId: template.id,
                      versionId: version.id,
                      reason,
                    })
                  }
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test harness */}
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <FlaskConical className="size-4" aria-hidden="true" />
              Test against a fixture
            </h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              Fixtures are entirely synthetic. No customer item, no customer photograph, and the
              result is never written to a listing.
            </p>

            <div className="mt-3 space-y-3">
              <Field label="Fixture" htmlFor="fixture">
                <Select
                  id="fixture"
                  value={fixtureId}
                  onChange={(event) => setFixtureId(event.target.value)}
                >
                  {fixtures.map((fixture) => (
                    <option key={fixture.id} value={fixture.id}>
                      {fixture.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <p className="text-[11px] leading-relaxed text-muted">
                {fixtures.find((fixture) => fixture.id === fixtureId)?.description}
              </p>

              <Button
                variant="outline"
                size="sm"
                full
                disabled={pending || dirty}
                onClick={() =>
                  startTransition(async () => {
                    setTestError(null);
                    setTestOutput(null);
                    const result = await testPromptAction({ versionId, fixtureId });
                    if (result.ok && result.data) {
                      setTestOutput(result.data.output);
                    } else {
                      setTestError(result.error ?? 'The test failed.');
                    }
                  })
                }
              >
                {pending ? 'Running…' : 'Run test'}
              </Button>

              {dirty ? (
                <p className="text-[11px] text-warning">Save the draft before testing it.</p>
              ) : null}

              {testError ? <Alert tone="danger">{testError}</Alert> : null}

              {testOutput ? (
                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-ink">
                    Output — validated against the production schema
                  </p>
                  <pre className="max-h-96 overflow-auto rounded-lg border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-ink">
                    {testOutput}
                  </pre>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <History className="size-4" aria-hidden="true" />
              Version history
            </h3>
            <ul className="mt-3 space-y-2">
              {template.versions.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => selectVersion(entry.id)}
                    className={
                      entry.id === versionId
                        ? 'w-full rounded-lg border border-ink bg-stone-50 p-2.5 text-left'
                        : 'w-full rounded-lg border border-stone-200 p-2.5 text-left hover:bg-stone-50'
                    }
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-ink">v{entry.version}</span>
                      {entry.id === template.publishedVersionId ? (
                        <Badge tone="success">
                          <Upload className="size-3" aria-hidden="true" />
                          live
                        </Badge>
                      ) : entry.isPublished ? (
                        <Badge tone="neutral">published</Badge>
                      ) : (
                        <Badge tone="warning">draft</Badge>
                      )}
                    </span>
                    {entry.notes ? (
                      <span className="mt-1 block text-[11px] leading-snug text-muted">
                        {entry.notes}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-[11px] text-subtle">
                      {relativeTime(new Date(entry.createdAt))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
