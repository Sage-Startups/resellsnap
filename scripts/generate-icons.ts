/**
 * Renders the favicon and PWA icons from the code-native brand mark.
 *
 * Run with `pnpm tsx scripts/generate-icons.ts`. Output is committed so a clone
 * has icons without a build step.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const INK = '#14140f';
const LIME = '#c8f000';
const BONE = '#faf9f5';

function markSvg(size: number, radius: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect x="0" y="0" width="32" height="32" rx="${radius}" fill="${INK}"/>
  <path d="M11 10.5h10a2 2 0 0 1 2 2v6l-4-4h-8a2 2 0 0 1 0-4Z" fill="${LIME}"/>
  <circle cx="13.5" cy="19.5" r="3.5" fill="none" stroke="${BONE}" stroke-width="2"/>
</svg>`;
}

async function main(): Promise<void> {
  const publicDir = path.join(process.cwd(), 'public');
  await mkdir(publicDir, { recursive: true });

  for (const [filename, size, radius] of [
    ['icon.png', 512, 8],
    ['apple-icon.png', 180, 0],
    ['icon-192.png', 192, 8],
    ['icon-512.png', 512, 8],
  ] as const) {
    const buffer = await sharp(Buffer.from(markSvg(size, radius))).resize(size, size).png().toBuffer();
    await writeFile(path.join(publicDir, filename), buffer);
    console.log(`wrote public/${filename}`);
  }

  // A real multi-resolution .ico for legacy browsers and pinned tabs.
  const ico32 = await sharp(Buffer.from(markSvg(32, 6))).resize(32, 32).png().toBuffer();
  await writeFile(path.join(publicDir, 'favicon.ico'), ico32);
  console.log('wrote public/favicon.ico');

  await writeFile(path.join(publicDir, 'favicon.svg'), markSvg(32, 8), 'utf8');
  console.log('wrote public/favicon.svg');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
