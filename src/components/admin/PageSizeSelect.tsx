'use client';

import { useRouter } from 'next/navigation';
import { OrdersSearchParams, PAGE_SIZE_OPTIONS, buildOrdersHref, resolvePageSize } from '@/lib/ordersQuery';

interface Props {
  current: OrdersSearchParams;
}

// «Кол-во на странице» селект у пагинации заказов — меняет page[size] через
// URL-параметр pageSize и сбрасывает текущую страницу на первую.
export default function PageSizeSelect({ current }: Props) {
  const router = useRouter();
  const value = resolvePageSize(current.pageSize);

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--admin-text-2)' }}>
      Кол-во на странице
      <select
        value={value}
        onChange={(e) => router.push(buildOrdersHref(current, { pageSize: e.target.value, page: undefined }))}
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}
