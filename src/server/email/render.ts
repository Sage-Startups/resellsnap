/**
 * Email rendering.
 *
 * A deliberately small, dependency-free renderer: paragraphs, ordered lists and
 * `[label](url)` links wrapped in a branded, responsive table layout that
 * survives Outlook and Gmail. Every interpolated value is HTML-escaped.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND_INK = '#14140f';
const BRAND_MUTED = '#6f6d63';
const BRAND_ACCENT = '#c8f000';
const BRAND_SURFACE = '#faf9f5';
const BRAND_BORDER = '#e3e0d6';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Replaces `{{token}}` placeholders. Unknown tokens are removed, not left raw. */
export function interpolate(template: string, tokens: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = tokens[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

/** Only http(s) links are emitted; anything else renders as plain text. */
function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

interface Block {
  type: 'paragraph' | 'list' | 'button';
  content: string;
  items?: string[];
  href?: string;
}

function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];

  for (const chunk of body.split(/\n{2,}/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    // A paragraph that is nothing but a link becomes the call-to-action button.
    const linkOnly = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(trimmed);
    if (linkOnly?.[1] && linkOnly[2]) {
      const href = safeUrl(linkOnly[2]);
      if (href) {
        blocks.push({ type: 'button', content: linkOnly[1], href });
        continue;
      }
    }

    const lines = trimmed.split('\n').map((line) => line.trim());
    if (lines.every((line) => /^\d+\.\s+/.test(line))) {
      blocks.push({
        type: 'list',
        content: '',
        items: lines.map((line) => line.replace(/^\d+\.\s+/, '')),
      });
      continue;
    }

    blocks.push({ type: 'paragraph', content: lines.join(' ') });
  }

  return blocks;
}

function inlineToHtml(value: string): string {
  return escapeHtml(value).replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (match, label: string, rawUrl: string) => {
      const href = safeUrl(rawUrl.replace(/&amp;/g, '&'));
      if (!href) return escapeHtml(label);
      return `<a href="${escapeHtml(href)}" style="color:${BRAND_INK};text-decoration:underline;">${label}</a>`;
    },
  );
}

function inlineToText(value: string): string {
  return value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => `${label}: ${url}`);
}

export function renderEmail(input: {
  subject: string;
  body: string;
  brandName: string;
  appUrl: string;
  supportEmail: string;
  preheader?: string;
}): RenderedEmail {
  const blocks = parseBlocks(input.body);

  const htmlBlocks = blocks
    .map((block) => {
      if (block.type === 'button' && block.href) {
        return `<tr><td style="padding:8px 0 20px;">
          <a href="${escapeHtml(block.href)}" style="display:inline-block;background:${BRAND_ACCENT};color:${BRAND_INK};font-weight:600;font-size:15px;padding:13px 24px;border-radius:8px;text-decoration:none;">${escapeHtml(block.content)}</a>
        </td></tr>`;
      }
      if (block.type === 'list' && block.items) {
        const items = block.items
          .map(
            (item) =>
              `<li style="margin:0 0 8px;color:${BRAND_INK};font-size:15px;line-height:1.6;">${inlineToHtml(item)}</li>`,
          )
          .join('');
        return `<tr><td style="padding:0 0 16px;"><ol style="margin:0;padding-left:20px;">${items}</ol></td></tr>`;
      }
      return `<tr><td style="padding:0 0 16px;color:${BRAND_INK};font-size:15px;line-height:1.65;">${inlineToHtml(block.content)}</td></tr>`;
    })
    .join('');

  const preheader = input.preheader ?? blocks.find((b) => b.type === 'paragraph')?.content ?? '';

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_SURFACE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader.slice(0, 140))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_SURFACE};padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BRAND_BORDER};border-radius:14px;overflow:hidden;">
    <tr><td style="padding:28px 32px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:26px;height:26px;background:${BRAND_INK};border-radius:7px;"></td>
        <td style="padding-left:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.01em;color:${BRAND_INK};">${escapeHtml(input.brandName)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:16px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${htmlBlocks}</table>
    </td></tr>
    <tr><td style="padding:8px 32px 28px;">
      <div style="border-top:1px solid ${BRAND_BORDER};padding-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND_MUTED};">
        Questions? Reply to this email or contact <a href="mailto:${escapeHtml(input.supportEmail)}" style="color:${BRAND_MUTED};">${escapeHtml(input.supportEmail)}</a>.<br>
        ${escapeHtml(input.brandName)} is an independent product and is not endorsed by or affiliated with eBay, Vinted, Depop, Meta or Facebook.<br>
        <a href="${escapeHtml(input.appUrl)}/app/settings" style="color:${BRAND_MUTED};">Manage email preferences</a>
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  const text = blocks
    .map((block) => {
      if (block.type === 'button' && block.href) return `${block.content}: ${block.href}`;
      if (block.type === 'list' && block.items) {
        return block.items.map((item, index) => `${index + 1}. ${inlineToText(item)}`).join('\n');
      }
      return inlineToText(block.content);
    })
    .join('\n\n');

  return {
    subject: input.subject,
    html,
    text: `${text}\n\n—\n${input.brandName}\n${input.appUrl}\nNot affiliated with eBay, Vinted, Depop, Meta or Facebook.`,
  };
}
