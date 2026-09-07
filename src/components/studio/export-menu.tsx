'use client';

import { useState } from 'react';
import { Download, FileJson, FileSpreadsheet, FileText, Images } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { createExportAction, getExportStatusAction } from '@/server/items/actions';
import type { PlatformKey } from '@/lib/enums';
import type { ExportFormat } from '@/generated/prisma/enums';

const FORMATS: Array<{ value: ExportFormat; label: string; icon: typeof FileText }> = [
  { value: 'PHOTO_ZIP', label: 'Photos (ZIP)', icon: Images },
  { value: 'TEXT', label: 'Listing text', icon: FileText },
  { value: 'JSON', label: 'JSON', icon: FileJson },
  { value: 'CSV', label: 'CSV', icon: FileSpreadsheet },
];

/**
 * Builds an export in the background, then hands the seller a signed download.
 * Polling stops as soon as the artifact is ready or the job fails.
 */
export function ExportMenu({
  itemId,
  platform,
}: {
  itemId: string;
  platform: PlatformKey | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function build(format: ExportFormat) {
    setBusy(format);
    setError(null);

    const created = await createExportAction({ itemId, platform, format });
    if (!created.ok || !created.data) {
      setError(created.error ?? 'That export could not be started.');
      setBusy(null);
      return;
    }

    const exportJobId = created.data.exportJobId;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const status = await getExportStatusAction(exportJobId);

      if (status.ok && status.data?.status === 'READY' && status.data.downloadUrl) {
        // Navigate rather than fetch, so the browser's own download UI handles it.
        window.location.assign(status.data.downloadUrl);
        setBusy(null);
        setOpen(false);
        return;
      }
      if (status.ok && status.data?.status === 'FAILED') {
        setError('The export failed to build. Please try again.');
        setBusy(null);
        return;
      }
    }

    setError('That export is taking longer than expected. Check back in a moment.');
    setBusy(null);
  }

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
        <Download />
        Export
      </Button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute left-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-stone-200 bg-paper shadow-float"
          >
            {FORMATS.map((format) => (
              <button
                key={format.value}
                type="button"
                role="menuitem"
                disabled={busy !== null}
                onClick={() => build(format.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-ink-soft hover:bg-stone-50 disabled:opacity-50"
              >
                {busy === format.value ? (
                  <Spinner />
                ) : (
                  <format.icon className="size-4" aria-hidden="true" />
                )}
                {busy === format.value ? 'Building…' : format.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {error ? <p className="mt-1 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
