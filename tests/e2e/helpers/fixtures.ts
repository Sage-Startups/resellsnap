/**
 * Test images.
 *
 * Generated rather than checked in, so the fixture always satisfies whatever
 * the product currently demands of a real photo (it rejects anything under
 * 200px on a side) without a binary in the repository.
 */
import sharp from 'sharp';

export interface UploadFixture {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A plain JPEG comfortably above the minimum dimensions. */
export async function jpegFixture(size = 480): Promise<UploadFixture> {
  const buffer = await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 214, g: 203, b: 184 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();

  return { name: 'item.jpg', mimeType: 'image/jpeg', buffer };
}

/** Deliberately too small: used to prove the upload guard actually rejects. */
export async function tinyJpegFixture(): Promise<UploadFixture> {
  const buffer = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer();

  return { name: 'tiny.jpg', mimeType: 'image/jpeg', buffer };
}
