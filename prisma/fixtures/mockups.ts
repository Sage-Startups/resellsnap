/**
 * Original product mockups.
 *
 * Generated in code rather than bundled as photography, so nothing in this
 * repository carries a third-party image licence and the whole project can
 * transfer cleanly to a buyer. They are deliberately abstract: neutral studio
 * backdrops with simple geometry standing in for the item.
 */
import sharp from 'sharp';

const PALETTE = {
  ink: '#14140f',
  bone: '#faf9f5',
  stone: '#e3e0d6',
  stoneDeep: '#c9c5b7',
  lime: '#c8f000',
};

export interface MockupSpec {
  id: string;
  label: string;
  /** Fill for the object silhouette. */
  tint: string;
  shape: 'trainer' | 'jacket' | 'machine' | 'camera';
  angle: 'front' | 'detail' | 'back';
}

function shapePath(shape: MockupSpec['shape'], angle: MockupSpec['angle']): string {
  const scale = angle === 'detail' ? 1.35 : 1;
  const offset = angle === 'back' ? 40 : 0;

  switch (shape) {
    case 'trainer':
      return `<g transform="translate(${300 + offset} 340) scale(${scale}) translate(-300 -340)">
        <path d="M150 380 Q150 300 200 290 L280 275 Q320 245 360 260 L400 300 Q460 315 470 355 Q475 385 440 390 L180 392 Q150 392 150 380 Z" />
        <path d="M150 386 L470 384 Q478 400 460 405 L165 407 Q145 400 150 386 Z" opacity="0.55" />
        <circle cx="300" cy="318" r="7" opacity="0.35" />
        <circle cx="330" cy="308" r="7" opacity="0.35" />
      </g>`;
    case 'jacket':
      return `<g transform="translate(${300 + offset} 330) scale(${scale}) translate(-300 -330)">
        <path d="M220 200 L280 178 L320 178 L380 200 L410 250 L385 268 L378 245 L378 430 L222 430 L222 245 L215 268 L190 250 Z" />
        <path d="M280 178 L300 240 L320 178" fill="${PALETTE.bone}" opacity="0.9" />
        <rect x="296" y="240" width="8" height="190" opacity="0.3" />
      </g>`;
    case 'machine':
      return `<g transform="translate(${300 + offset} 330) scale(${scale}) translate(-300 -330)">
        <rect x="215" y="205" width="170" height="215" rx="14" />
        <rect x="238" y="230" width="124" height="60" rx="8" opacity="0.35" />
        <rect x="272" y="315" width="56" height="46" rx="6" fill="${PALETTE.bone}" opacity="0.85" />
        <rect x="250" y="386" width="100" height="12" rx="6" opacity="0.4" />
        <circle cx="352" cy="252" r="10" opacity="0.5" />
      </g>`;
    case 'camera':
    default:
      return `<g transform="translate(${300 + offset} 330) scale(${scale}) translate(-300 -330)">
        <rect x="200" y="248" width="200" height="130" rx="16" />
        <rect x="258" y="226" width="60" height="26" rx="7" />
        <circle cx="300" cy="313" r="46" fill="${PALETTE.bone}" opacity="0.9" />
        <circle cx="300" cy="313" r="30" opacity="0.55" />
        <circle cx="300" cy="313" r="14" opacity="0.85" />
        <rect x="342" y="262" width="30" height="14" rx="4" opacity="0.5" />
      </g>`;
  }
}

export function buildMockupSvg(spec: MockupSpec): string {
  const gradientId = `bg-${spec.id}-${spec.angle}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${PALETTE.bone}" />
      <stop offset="62%" stop-color="${PALETTE.stone}" />
      <stop offset="100%" stop-color="${PALETTE.stoneDeep}" />
    </linearGradient>
    <radialGradient id="shadow-${gradientId}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${PALETTE.ink}" stop-opacity="0.20" />
      <stop offset="100%" stop-color="${PALETTE.ink}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="600" height="600" fill="url(#${gradientId})" />
  <ellipse cx="300" cy="432" rx="170" ry="26" fill="url(#shadow-${gradientId})" />

  <g fill="${spec.tint}">${shapePath(spec.shape, spec.angle)}</g>

  <rect x="24" y="24" width="86" height="22" rx="11" fill="${PALETTE.ink}" opacity="0.08" />
  <text x="36" y="39" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="11" font-weight="600" fill="${PALETTE.ink}" opacity="0.55">SAMPLE</text>
</svg>`;
}

export async function renderMockup(spec: MockupSpec): Promise<Buffer> {
  return sharp(Buffer.from(buildMockupSvg(spec))).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

export async function renderMockupWebp(spec: MockupSpec, size = 640): Promise<Buffer> {
  return sharp(Buffer.from(buildMockupSvg(spec)))
    .resize(size, size, { fit: 'cover' })
    .webp({ quality: 82 })
    .toBuffer();
}

/** The four fictional demo items. Generic, non-branded, non-counterfeit. */
export const DEMO_ITEM_MOCKUPS: Array<Omit<MockupSpec, 'angle'>> = [
  { id: 'trainers', label: 'Cream leather trainers', tint: '#8d8577', shape: 'trainer' },
  { id: 'jacket', label: 'Vintage denim jacket', tint: '#5f7392', shape: 'jacket' },
  { id: 'espresso', label: 'Compact espresso machine', tint: '#4a4a46', shape: 'machine' },
  { id: 'camera', label: '35mm film camera', tint: '#3a3a38', shape: 'camera' },
];

export const MOCKUP_ANGLES: Array<MockupSpec['angle']> = ['front', 'detail', 'back'];
