'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Copy-to-clipboard with a clear confirmation. For the export-first platforms
 * this is the primary interaction, so it needs to feel instant and certain.
 */
export function CopyButton({
  value,
  label = 'Copy',
  className,
  variant = 'icon',
}: {
  value: string;
  label?: string;
  className?: string;
  variant?: 'icon' | 'button';
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers and insecure origins: fall back to a hidden textarea.
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={copy}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-paper px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-stone-50',
          className,
        )}
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        {copied ? 'Copied' : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      className={cn(
        'rounded-md p-1.5 text-subtle transition-colors hover:bg-stone-100 hover:text-ink',
        className,
      )}
    >
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
