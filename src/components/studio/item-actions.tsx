'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, CheckCircle2, MoreHorizontal, Package, Tag, Trash2 } from 'lucide-react';
import {
  Alert, Button, Card, CardContent, Field, Input, Select,
} from '@/components/ui';
import { changeStatusAction, deleteItemAction, recordSaleAction } from '@/server/items/actions';
import { parseMoneyToCents } from '@/lib/money';
import type { ItemStatus } from '@/lib/enums';

export function ItemActions({
  itemId,
  status,
  currency,
  hasSaleRecord,
}: {
  itemId: string;
  status: ItemStatus;
  currency: string;
  hasSaleRecord: boolean;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<'none' | 'sale' | 'delete'>('none');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatus(next: ItemStatus, note?: string) {
    startTransition(async () => {
      const result = await changeStatusAction({ itemId, status: next, note });
      if (!result.ok) setError(result.error ?? 'Could not update the status.');
      setMenuOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'READY' ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setStatus('LISTED')}>
            <Tag />
            Mark as listed
          </Button>
        ) : null}

        {(status === 'LISTED' || status === 'READY') && !hasSaleRecord ? (
          <Button variant="primary" size="sm" onClick={() => setMode('sale')}>
            <CheckCircle2 />
            Mark as sold
          </Button>
        ) : null}

        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            aria-label="More actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreHorizontal />
          </Button>

          {menuOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-stone-200 bg-paper shadow-float"
              >
                {status !== 'READY' && status !== 'SOLD' ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setStatus('READY', 'Relisted')}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-ink-soft hover:bg-stone-50"
                  >
                    <Package className="size-4" aria-hidden="true" />
                    Move back to ready
                  </button>
                ) : null}

                {status !== 'ARCHIVED' ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setStatus('ARCHIVED')}
                    className="flex w-full items-center gap-2.5 border-t border-stone-200 px-3 py-2.5 text-left text-[13px] text-ink-soft hover:bg-stone-50"
                  >
                    <Archive className="size-4" aria-hidden="true" />
                    Archive
                  </button>
                ) : null}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setMode('delete');
                  }}
                  className="flex w-full items-center gap-2.5 border-t border-stone-200 px-3 py-2.5 text-left text-[13px] text-danger hover:bg-danger-wash"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}

      {/* Record a sale */}
      {mode === 'sale' ? (
        <Card className="w-full sm:w-96">
          <CardContent className="p-4">
            <h3 className="text-[14px] font-semibold text-ink">Record the sale</h3>
            <p className="mt-1 text-[12px] text-muted">
              These figures are yours, entered by you. Analytics keeps them separate from anything
              an official API reports.
            </p>

            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                startTransition(async () => {
                  const result = await recordSaleAction(itemId, {
                    platform: String(formData.get('platform')),
                    salePriceCents: parseMoneyToCents(String(formData.get('price') ?? '')) ?? 0,
                    feesCents: parseMoneyToCents(String(formData.get('fees') ?? '')) ?? 0,
                    shippingCents: parseMoneyToCents(String(formData.get('shipping') ?? '')) ?? 0,
                    soldAt: String(formData.get('soldAt')),
                  });
                  if (!result.ok) {
                    setError(result.error ?? 'Could not record that sale.');
                    return;
                  }
                  setMode('none');
                  router.refresh();
                });
              }}
            >
              <Field label="Where did it sell?" htmlFor="sale-platform" required>
                <Select id="sale-platform" name="platform" required defaultValue="EBAY">
                  <option value="EBAY">eBay</option>
                  <option value="VINTED">Vinted</option>
                  <option value="DEPOP">Depop</option>
                  <option value="FACEBOOK_MARKETPLACE">Facebook Marketplace</option>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Sale price" htmlFor="sale-price" required>
                  <Input id="sale-price" name="price" inputMode="decimal" required placeholder={`${currency} 0.00`} />
                </Field>
                <Field label="Fees" htmlFor="sale-fees">
                  <Input id="sale-fees" name="fees" inputMode="decimal" placeholder="0.00" />
                </Field>
                <Field label="Shipping you paid" htmlFor="sale-shipping">
                  <Input id="sale-shipping" name="shipping" inputMode="decimal" placeholder="0.00" />
                </Field>
                <Field label="Sold on" htmlFor="sale-date" required>
                  <Input
                    id="sale-date"
                    name="soldAt"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </Field>
              </div>

              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={pending}>
                  {pending ? 'Saving…' : 'Record sale'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMode('none')}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Delete confirmation */}
      {mode === 'delete' ? (
        <Card className="w-full border-danger sm:w-96">
          <CardContent className="p-4">
            <h3 className="text-[14px] font-semibold text-ink">Delete this item?</h3>
            <Alert tone="neutral" className="mt-2">
              It moves to a recoverable state and is permanently removed, with its photos, after the
              retention period. You can restore it from Inventory until then.
            </Alert>
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteItemAction(itemId);
                    router.push('/app/inventory');
                  })
                }
              >
                {pending ? 'Deleting…' : 'Yes, delete it'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode('none')}>
                Keep it
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
