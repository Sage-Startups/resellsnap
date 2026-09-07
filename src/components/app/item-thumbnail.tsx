import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Photos live in private storage, so the app renders them through a signed
 * download route rather than a direct bucket URL. The route re-checks workspace
 * ownership on every request.
 */
export function ItemThumbnail({
  objectKey,
  alt,
  className,
  size = 96,
}: {
  objectKey: string | null;
  alt: string;
  className?: string;
  size?: number;
}) {
  if (!objectKey) {
    return (
      <div
        className={cn(
          'grid shrink-0 place-items-center rounded-lg border border-stone-200 bg-stone-50 text-subtle',
          className,
        )}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <ImageOff className="size-4" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived
    // URLs from our own origin; next/image would cache them past expiry.
    <img
      src={`/api/photos?key=${encodeURIComponent(objectKey)}`}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn('shrink-0 rounded-lg border border-stone-200 object-cover', className)}
      style={{ width: size, height: size }}
    />
  );
}
