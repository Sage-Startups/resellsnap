import Link from 'next/link';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
  className?: string;
}

/** One table implementation for every admin list, so they all behave alike. */
export function AdminTable<T>({
  columns,
  rows,
  caption,
  rowKey,
  rowHref,
  empty = 'Nothing to show.',
}: {
  columns: Column<T>[];
  rows: T[];
  caption: string;
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-[13px] text-muted">{empty}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-stone-200 bg-stone-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr key={rowKey(row)} className="hover:bg-stone-50">
                  {columns.map((column, index) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-2.5 text-[13px] text-ink',
                        column.align === 'right' && 'text-right',
                        column.className,
                      )}
                    >
                      {href && index === 0 ? (
                        <Link href={href} className="block hover:underline">
                          {column.render(row)}
                        </Link>
                      ) : (
                        column.render(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AdminPagination({
  page,
  pageCount,
  total,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between pt-3">
      <p className="text-[12px] text-muted">
        Page {page} of {pageCount} · {total.toLocaleString()} rows
      </p>
      <div className="flex gap-2">
        <Link
          href={hrefFor(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={cn(
            'rounded-lg border border-stone-300 bg-paper px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-stone-50',
            page <= 1 && 'pointer-events-none opacity-40',
          )}
        >
          Previous
        </Link>
        <Link
          href={hrefFor(Math.min(pageCount, page + 1))}
          aria-disabled={page >= pageCount}
          className={cn(
            'rounded-lg border border-stone-300 bg-paper px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-stone-50',
            page >= pageCount && 'pointer-events-none opacity-40',
          )}
        >
          Next
        </Link>
      </div>
    </nav>
  );
}
