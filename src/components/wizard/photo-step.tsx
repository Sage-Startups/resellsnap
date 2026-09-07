'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { AlertTriangle, Camera, CheckCircle2, GripVertical, Upload, X } from 'lucide-react';
import { Alert, Button, Spinner } from '@/components/ui';
import {
  confirmUploadAction,
  deletePhotoAction,
  getPhotoStatusesAction,
  reorderPhotosAction,
  requestUploadTicketAction,
} from '@/server/items/actions';
import { cn } from '@/lib/utils';

export interface WizardPhoto {
  id: string;
  status: string;
  objectKey: string;
  thumbnailKey: string | null;
  position: number;
  blurScore: number | null;
  brightness: number | null;
  isDuplicateOf: string | null;
  rejectReason: string | null;
  /** Local object URL, shown instantly before the server has a thumbnail. */
  previewUrl?: string;
}

const ACCEPTED = 'image/jpeg,image/png,image/webp';

const PHOTO_CHECKLIST = [
  'The whole item, straight on',
  'The back or reverse side',
  'The brand or size label, close up',
  'Any damage, mark or missing part',
  'The sole, base or underside',
  'Anything included in the sale',
];

export function PhotoStep({
  itemId,
  maxPhotos,
  maxBytes,
  initialPhotos,
  onReady,
}: {
  itemId: string;
  maxPhotos: number;
  maxBytes: number;
  initialPhotos: WizardPhoto[];
  onReady: (count: number) => void;
}) {
  const [photos, setPhotos] = useState<WizardPhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const processed = photos.filter((photo) => photo.status === 'PROCESSED');
  const pending = photos.filter(
    (photo) => photo.status === 'PENDING' || photo.status === 'UPLOADED',
  );

  useEffect(() => {
    onReady(processed.length);
  }, [processed.length, onReady]);

  // Poll while the worker is still turning uploads into processed photos.
  useEffect(() => {
    if (pending.length === 0) return;
    const timer = setInterval(async () => {
      const result = await getPhotoStatusesAction(itemId);
      if (result.ok && result.data) {
        setPhotos((current) =>
          result.data!.map((server) => ({
            ...server,
            previewUrl: current.find((photo) => photo.id === server.id)?.previewUrl,
          })),
        );
      }
    }, 1800);
    return () => clearInterval(timer);
  }, [itemId, pending.length]);

  const upload = useCallback(
    async (files: File[]) => {
      setError(null);

      const room = maxPhotos - photos.length;
      if (room <= 0) {
        setError(`You can upload up to ${maxPhotos} photos per item.`);
        return;
      }

      const accepted = files.slice(0, room);
      if (files.length > room) {
        setError(`Only the first ${room} of those photos were added — the limit is ${maxPhotos}.`);
      }

      setUploading((count) => count + accepted.length);

      for (const file of accepted) {
        try {
          if (!ACCEPTED.split(',').includes(file.type)) {
            setError('Photos must be JPEG, PNG or WebP.');
            continue;
          }
          if (file.size > maxBytes) {
            setError(
              `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${Math.round(maxBytes / 1024 / 1024)}MB.`,
            );
            continue;
          }

          const ticket = await requestUploadTicketAction({
            itemId,
            contentType: file.type,
            byteSize: file.size,
          });

          if (!ticket.ok || !ticket.data) {
            setError(ticket.error ?? 'That upload could not be started.');
            continue;
          }

          // Direct to the bucket — the file never passes through our server.
          const response = await fetch(ticket.data.url, {
            method: ticket.data.method,
            headers: ticket.data.headers,
            body: file,
          });

          if (!response.ok) {
            setError(`"${file.name}" failed to upload. Please try again.`);
            continue;
          }

          await confirmUploadAction({ itemId, photoId: ticket.data.photoId });

          setPhotos((current) => [
            ...current,
            {
              id: ticket.data!.photoId,
              status: 'UPLOADED',
              objectKey: ticket.data!.objectKey,
              thumbnailKey: null,
              position: current.length,
              blurScore: null,
              brightness: null,
              isDuplicateOf: null,
              rejectReason: null,
              previewUrl: URL.createObjectURL(file),
            },
          ]);
        } catch {
          setError('Something went wrong while uploading. Please try again.');
        } finally {
          setUploading((count) => Math.max(0, count - 1));
        }
      }
    },
    [itemId, maxBytes, maxPhotos, photos.length],
  );

  function remove(photoId: string) {
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    startTransition(async () => {
      await deletePhotoAction({ itemId, photoId });
    });
  }

  function move(photoId: string, direction: -1 | 1) {
    setPhotos((current) => {
      const index = current.findIndex((photo) => photo.id === photoId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      void reorderPhotosAction({ itemId, orderedPhotoIds: next.map((photo) => photo.id) });
      return next;
    });
  }

  const warnings = buildWarnings(photos);

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void upload([...event.dataTransfer.files]);
        }}
        className={cn(
          'rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          dragOver ? 'border-ink bg-lime-wash/40' : 'border-stone-300 bg-stone-50/60',
        )}
      >
        <Upload className="mx-auto size-7 text-subtle" aria-hidden="true" />
        <p className="mt-3 text-[15px] font-medium text-ink">Add photos of your item</p>
        <p className="mt-1 text-[13px] text-muted">
          Drag them here, or use the buttons below. Up to {maxPhotos} photos, JPEG, PNG or WebP.
        </p>

        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            <Upload />
            Choose photos
          </Button>
          <Button variant="outline" onClick={() => cameraRef.current?.click()}>
            <Camera />
            Take a photo
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="sr-only"
          onChange={(event) => {
            void upload([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            void upload([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </div>

      {error ? <Alert tone="warning">{error}</Alert> : null}

      {uploading > 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner /> Uploading {uploading} {uploading === 1 ? 'photo' : 'photos'}…
        </p>
      ) : null}

      {/* Photo grid */}
      {photos.length > 0 ? (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink">
              {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
              {pending.length > 0 ? ` · ${pending.length} still processing` : ''}
            </p>
            <p className="text-[12px] text-muted">The first photo is your cover</p>
          </div>

          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, index) => (
              <li key={photo.id} className="group relative">
                <div
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-lg border bg-stone-100',
                    photo.status === 'REJECTED' ? 'border-danger' : 'border-stone-200',
                    index === 0 && 'ring-2 ring-ink ring-offset-2',
                  )}
                >
                  {photo.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                    <img src={photo.previewUrl} alt="" className="size-full object-cover" />
                  ) : photo.thumbnailKey ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed private URL
                    <img
                      src={`/api/photos?key=${encodeURIComponent(photo.thumbnailKey)}`}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="grid size-full place-items-center">
                      <Spinner />
                    </div>
                  )}

                  {photo.status !== 'PROCESSED' && photo.status !== 'REJECTED' ? (
                    <div className="absolute inset-0 grid place-items-center bg-bone/70">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
                        <Spinner /> Checking
                      </span>
                    </div>
                  ) : null}

                  {index === 0 ? (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium text-bone">
                      Cover
                    </span>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => remove(photo.id)}
                    aria-label={`Remove photo ${index + 1}`}
                    className="absolute right-1.5 top-1.5 rounded-full bg-ink/80 p-1 text-bone opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>

                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[11px] text-subtle">#{index + 1}</span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => move(photo.id, -1)}
                      disabled={index === 0}
                      aria-label={`Move photo ${index + 1} earlier`}
                      className="rounded p-0.5 text-subtle hover:text-ink disabled:opacity-30"
                    >
                      <GripVertical className="size-3.5 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(photo.id, 1)}
                      disabled={index === photos.length - 1}
                      aria-label={`Move photo ${index + 1} later`}
                      className="rounded p-0.5 text-subtle hover:text-ink disabled:opacity-30"
                    >
                      <GripVertical className="size-3.5 -rotate-90" />
                    </button>
                  </span>
                </div>

                {photo.rejectReason ? (
                  <p className="mt-1 text-[11px] leading-snug text-danger">{photo.rejectReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Quality suggestions — never blockers */}
      {warnings.length > 0 ? (
        <Alert tone="warning" title="A couple of suggestions">
          <ul className="mt-1 space-y-1">
            {warnings.map((warning) => (
              <li key={warning} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {warning}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] opacity-80">
            You can carry on regardless — these are suggestions, not requirements.
          </p>
        </Alert>
      ) : null}

      {/* Checklist */}
      <details className="rounded-lg border border-stone-200 bg-paper px-4 py-3">
        <summary className="cursor-pointer text-[13px] font-medium text-ink">
          What photos should I take?
        </summary>
        <ul className="mt-3 space-y-1.5">
          {PHOTO_CHECKLIST.map((entry, index) => (
            <li key={entry} className="flex gap-2 text-[13px] text-muted">
              {index < processed.length ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-stone-400" aria-hidden="true" />
              )}
              {entry}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Quality heuristics computed on the server during processing. */
function buildWarnings(photos: WizardPhoto[]): string[] {
  const warnings: string[] = [];
  const processed = photos.filter((photo) => photo.status === 'PROCESSED');

  const blurry = processed.filter((photo) => (photo.blurScore ?? 1) < 0.12);
  if (blurry.length > 0) {
    warnings.push(
      `${blurry.length} ${blurry.length === 1 ? 'photo looks' : 'photos look'} blurry. A sharper shot helps buyers and helps the analysis.`,
    );
  }

  const dark = processed.filter((photo) => (photo.brightness ?? 0.5) < 0.22);
  if (dark.length > 0) {
    warnings.push(
      `${dark.length} ${dark.length === 1 ? 'photo is' : 'photos are'} quite dark. Daylight near a window works well.`,
    );
  }

  const duplicates = processed.filter((photo) => photo.isDuplicateOf);
  if (duplicates.length > 0) {
    warnings.push(
      `${duplicates.length} ${duplicates.length === 1 ? 'photo looks like a duplicate' : 'photos look like duplicates'}. Different angles are more useful.`,
    );
  }

  if (processed.length > 0 && processed.length < 3) {
    warnings.push('Three or more angles usually produce a noticeably better listing.');
  }

  return warnings;
}
