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
  // `detail` crops in on the object; `back` shifts the viewpoint slightly so
  // the three angles read as three distinct photographs rather than one image
  // repeated.
  const scale = angle === 'detail' ? 1.28 : 1;
  const flip = angle === 'back' ? -1 : 1;
  const wrap = (body: string) =>
    `<g transform="translate(300 310) scale(${(scale * flip).toFixed(3)} ${scale.toFixed(3)}) translate(-300 -310)">${body}</g>`;

  switch (shape) {
    case 'trainer':
      return wrap(`
        <path d="M120 372 C120 330 142 312 176 300 L246 276 C262 246 292 232 318 244 L352 288 C404 300 452 318 474 348 C486 366 480 382 456 384 L138 388 C124 388 120 382 120 372 Z"/>
        <path d="M120 378 L474 372 C492 380 492 398 470 402 L142 406 C122 402 114 388 120 378 Z" opacity="0.62"/>
        <path d="M258 282 L300 262" stroke="rgba(250,249,245,0.75)" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M282 300 L322 282" stroke="rgba(250,249,245,0.75)" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M306 318 L344 302" stroke="rgba(250,249,245,0.75)" stroke-width="7" stroke-linecap="round" fill="none"/>
        <circle cx="418" cy="344" r="16" fill="rgba(250,249,245,0.35)"/>
      `);

    case 'jacket':
      return wrap(`
        <path d="M214 178 L282 152 L318 152 L386 178 L424 240 L388 262 L378 232 L378 452 L222 452 L222 232 L212 262 L176 240 Z"/>
        <path d="M282 152 L300 232 L318 152 L300 146 Z" fill="rgba(250,249,245,0.92)"/>
        <rect x="295" y="228" width="10" height="224" fill="rgba(250,249,245,0.30)"/>
        <path d="M240 300 L268 300 L268 348 L240 348 Z" fill="rgba(250,249,245,0.22)"/>
        <path d="M332 300 L360 300 L360 348 L332 348 Z" fill="rgba(250,249,245,0.22)"/>
        <circle cx="300" cy="268" r="5" fill="rgba(250,249,245,0.55)"/>
        <circle cx="300" cy="330" r="5" fill="rgba(250,249,245,0.55)"/>
        <circle cx="300" cy="392" r="5" fill="rgba(250,249,245,0.55)"/>
      `);

    case 'machine':
      return wrap(`
        <rect x="200" y="164" width="200" height="252" rx="16"/>
        <rect x="224" y="192" width="152" height="72" rx="9" fill="rgba(250,249,245,0.28)"/>
        <rect x="248" y="298" width="104" height="14" rx="7" fill="rgba(250,249,245,0.55)"/>
        <path d="M282 312 h36 v34 a18 18 0 0 1 -36 0 Z" fill="rgba(250,249,245,0.85)"/>
        <rect x="244" y="382" width="112" height="12" rx="6" fill="rgba(250,249,245,0.4)"/>
        <circle cx="356" cy="228" r="12" fill="rgba(250,249,245,0.6)"/>
        <rect x="392" y="228" width="26" height="96" rx="13"/>
        <rect x="400" y="316" width="10" height="40" rx="5"/>
      `);

    case 'camera':
    default:
      return wrap(`
        <rect x="176" y="228" width="248" height="152" rx="18"/>
        <rect x="252" y="200" width="76" height="30" rx="8"/>
        <circle cx="300" cy="304" r="60" fill="rgba(250,249,245,0.9)"/>
        <circle cx="300" cy="304" r="44" fill="rgba(20,20,15,0.55)"/>
        <circle cx="300" cy="304" r="24" fill="rgba(20,20,15,0.85)"/>
        <circle cx="286" cy="290" r="8" fill="rgba(250,249,245,0.5)"/>
        <rect x="352" y="246" width="42" height="16" rx="5" fill="rgba(250,249,245,0.45)"/>
        <circle cx="206" cy="252" r="9" fill="rgba(250,249,245,0.4)"/>
      `);
  }
}

export function buildMockupSvg(spec: MockupSpec): string {
  const gradientId = `bg-${spec.id}-${spec.angle}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${PALETTE.bone}" />
      <stop offset="55%" stop-color="${PALETTE.stone}" />
      <stop offset="100%" stop-color="${PALETTE.stoneDeep}" />
    </linearGradient>
    <radialGradient id="shadow-${gradientId}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${PALETTE.ink}" stop-opacity="0.28" />
      <stop offset="100%" stop-color="${PALETTE.ink}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="600" height="600" fill="url(#${gradientId})" />
  <ellipse cx="300" cy="452" rx="190" ry="30" fill="url(#shadow-${gradientId})" />

  <g fill="${spec.tint}">${shapePath(spec.shape, spec.angle)}</g>

  <rect x="20" y="556" width="82" height="22" rx="11" fill="${PALETTE.ink}" opacity="0.10" />
  <text x="31" y="571" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="11" font-weight="600" letter-spacing="0.06em" fill="${PALETTE.ink}" opacity="0.6">SAMPLE</text>
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
  { id: 'trainers', label: 'Cream leather trainers', tint: '#a2988a', shape: 'trainer' },
  { id: 'jacket', label: 'Vintage denim jacket', tint: '#4d6a91', shape: 'jacket' },
  { id: 'espresso', label: 'Compact espresso machine', tint: '#3f4340', shape: 'machine' },
  { id: 'camera', label: '35mm film camera', tint: '#33322f', shape: 'camera' },
];

export const MOCKUP_ANGLES: Array<MockupSpec['angle']> = ['front', 'detail', 'back'];
