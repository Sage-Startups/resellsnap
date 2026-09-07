/**
 * Image validation and processing.
 *
 * Files are checked twice: once before we hand out a signed upload URL (the
 * declared type and size), and again after upload by reading the actual bytes.
 * The second check is the one that matters — a client can declare anything.
 */
import sharp from 'sharp';
import type { Metadata, Sharp } from 'sharp';
import { sha256Hex } from '@/lib/crypto';
import { logger } from '@/lib/logger';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const MIN_DIMENSION = 200;
export const MAX_DIMENSION = 8000;

export function isAllowedImageType(value: string): value is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Magic-byte sniffing. Extension and declared MIME type are hints; these bytes
 * are the evidence. Also rejects the classic polyglot trick of appending image
 * headers to an archive or script.
 */
export function detectImageType(buffer: Buffer): AllowedImageType | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((byte, index) => buffer[index] === byte)) return 'image/png';

  // WebP: "RIFF" .... "WEBP"
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

export interface ValidatedImage {
  contentType: AllowedImageType;
  width: number;
  height: number;
  byteSize: number;
  checksumSha256: string;
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

export async function validateImageBuffer(buffer: Buffer, maxBytes: number): Promise<ValidatedImage> {
  if (buffer.length === 0) throw new ImageValidationError('The uploaded file is empty.');
  if (buffer.length > maxBytes) {
    throw new ImageValidationError(
      `That photo is ${(buffer.length / 1024 / 1024).toFixed(1)}MB. The limit is ${(maxBytes / 1024 / 1024).toFixed(0)}MB.`,
    );
  }

  const contentType = detectImageType(buffer);
  if (!contentType) {
    throw new ImageValidationError('That file is not a JPEG, PNG or WebP image.');
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw new ImageValidationError('That image could not be read. It may be corrupt.');
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    throw new ImageValidationError(
      `That photo is ${width}×${height}. Please upload something at least ${MIN_DIMENSION}px on each side.`,
    );
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ImageValidationError(`That photo exceeds the ${MAX_DIMENSION}px limit on one side.`);
  }

  return {
    contentType,
    width,
    height,
    byteSize: buffer.length,
    checksumSha256: sha256Hex(buffer),
  };
}

export interface ProcessedImage {
  /** Re-encoded original with all metadata removed. */
  sanitized: Buffer;
  sanitizedContentType: 'image/jpeg';
  thumbnail: Buffer;
  thumbnailContentType: 'image/webp';
  width: number;
  height: number;
  blurScore: number;
  brightness: number;
  perceptualHash: string;
}

/**
 * Re-encodes an upload, which strips EXIF (including GPS coordinates and camera
 * serial numbers) as a side effect of not passing them through, and produces a
 * thumbnail plus the quality signals the wizard shows the seller.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  const pipeline = sharp(buffer, { failOn: 'error' }).rotate(); // honour EXIF orientation, then drop it

  const metadata = await pipeline.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const sanitized = await pipeline
    .clone()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  const thumbnail = await pipeline
    .clone()
    .resize({ width: 480, height: 480, fit: 'cover', position: 'attention' })
    .webp({ quality: 78 })
    .toBuffer();

  const { blurScore, brightness } = await analyzeQuality(pipeline.clone());
  const perceptualHash = await computePerceptualHash(pipeline.clone());

  return {
    sanitized,
    sanitizedContentType: 'image/jpeg',
    thumbnail,
    thumbnailContentType: 'image/webp',
    width,
    height,
    blurScore,
    brightness,
    perceptualHash,
  };
}

/**
 * Blur is estimated from the variance of a Laplacian-like edge response;
 * brightness from mean luminance. Both are heuristics used only to *suggest* a
 * better photo — they never block an upload.
 */
async function analyzeQuality(pipeline: Sharp): Promise<{ blurScore: number; brightness: number }> {
  try {
    const { data, info } = await pipeline
      .greyscale()
      .resize({ width: 256, height: 256, fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let sum = 0;
    for (const value of data) sum += value;
    const brightness = sum / data.length / 255;

    const { width, height } = info;
    let edgeSum = 0;
    let edgeSquareSum = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const laplacian =
          4 * (data[index] ?? 0) -
          (data[index - 1] ?? 0) -
          (data[index + 1] ?? 0) -
          (data[index - width] ?? 0) -
          (data[index + width] ?? 0);
        edgeSum += laplacian;
        edgeSquareSum += laplacian * laplacian;
        count += 1;
      }
    }

    if (count === 0) return { blurScore: 1, brightness };
    const mean = edgeSum / count;
    const variance = edgeSquareSum / count - mean * mean;

    // Normalised so ~0 is very blurry and 1 is crisp. The 400 divisor was
    // chosen against a sample of phone photos of clothing and electronics.
    return { blurScore: Math.min(1, Math.max(0, variance / 400)), brightness };
  } catch (error) {
    logger.warn('Image quality analysis failed', { error });
    return { blurScore: 1, brightness: 0.5 };
  }
}

/**
 * 64-bit average hash. Good enough to spot the same photo uploaded twice, which
 * is the only thing we use it for.
 */
async function computePerceptualHash(pipeline: Sharp): Promise<string> {
  try {
    const { data } = await pipeline
      .greyscale()
      .resize({ width: 8, height: 8, fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let total = 0;
    for (const value of data) total += value;
    const average = total / data.length;

    let bits = '';
    for (const value of data) bits += value >= average ? '1' : '0';

    return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  } catch {
    return '';
  }
}

/** Hamming distance between two average hashes; ≤ 5 reads as "the same photo". */
export function hashDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let distance = 0;
  let xor = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

export const DUPLICATE_HASH_THRESHOLD = 5;
export const BLUR_WARNING_THRESHOLD = 0.12;
export const DARK_WARNING_THRESHOLD = 0.22;
export const BRIGHT_WARNING_THRESHOLD = 0.9;
