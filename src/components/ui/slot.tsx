import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Minimal `asChild` implementation.
 *
 * Deliberately NOT a client component: it uses no hooks, and marking it
 * `'use client'` would make a server-rendered `<Button asChild>` hand
 * `Children.only` a serialized client reference rather than the element,
 * which fails at runtime in a production build.
 *
 * Merges the wrapper's props onto its single child element so `<Button asChild>
 * <Link/></Button>` renders one anchor rather than a button wrapping a link.
 * Written by hand rather than pulled from a dependency because it is 30 lines
 * and a buyer should not need to learn a library to read it.
 */
export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: ReactNode;
}

type AnyProps = Record<string, unknown>;

export function Slot({ children, ...slotProps }: SlotProps) {
  const child = Children.only(children);

  if (!isValidElement(child)) return null;

  const childProps = (child as ReactElement<AnyProps>).props;
  const merged: AnyProps = { ...slotProps, ...childProps };

  merged.className = cn(slotProps.className as string, childProps.className as string);

  if (slotProps.style || childProps.style) {
    merged.style = { ...(slotProps.style ?? {}), ...((childProps.style as object) ?? {}) };
  }

  // Both handlers run, wrapper first, so a Slot can add behaviour without
  // silently swallowing the child's own handler.
  for (const key of Object.keys(slotProps)) {
    if (!/^on[A-Z]/.test(key)) continue;
    const slotHandler = (slotProps as AnyProps)[key];
    const childHandler = childProps[key];
    if (typeof slotHandler === 'function' && typeof childHandler === 'function') {
      merged[key] = (...args: unknown[]) => {
        (slotHandler as (...a: unknown[]) => void)(...args);
        (childHandler as (...a: unknown[]) => void)(...args);
      };
    }
  }

  return cloneElement(child as ReactElement<AnyProps>, merged);
}
