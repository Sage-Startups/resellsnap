import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/site';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${SITE.name} — ${SITE.tagline}`;

/**
 * Social card, rendered at request time from the same brand tokens as the site
 * so it never drifts out of sync with a hand-exported PNG.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#faf9f5',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#14140f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 24, height: 12, borderRadius: 4, background: '#c8f000' }} />
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              fontSize: 32,
              fontWeight: 700,
              color: '#14140f',
              letterSpacing: '-0.02em',
            }}
          >
            <span>ResellSnap</span>
            <span style={{ color: '#6f6d63', fontWeight: 500 }}>AI</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: '#14140f',
              letterSpacing: '-0.035em',
              lineHeight: 1.05,
            }}
          >
            Snap it. List it. Sell it.
          </div>
          <div style={{ marginTop: 24, fontSize: 30, color: '#6f6d63', lineHeight: 1.35, maxWidth: 900 }}>
            Turn 6 photos into 4 ready-to-list drafts for eBay, Vinted, Depop and Facebook
            Marketplace.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          {['eBay', 'Vinted', 'Depop', 'Facebook Marketplace'].map((name) => (
            <div
              key={name}
              style={{
                display: 'flex',
                padding: '10px 20px',
                borderRadius: 999,
                border: '1px solid #e3e0d6',
                background: '#ffffff',
                fontSize: 22,
                color: '#3d3c35',
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
