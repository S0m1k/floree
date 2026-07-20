import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// Статусы, в которых букет нельзя продать (зеркало BOUQUET_UNSELLABLE_STATUSES
// бэкенда) — грид кассы показывает только продаваемые.
const UNSELLABLE = new Set(['purchased', 'deleted', 'cancelled', 'disassembled']);

interface JsonApiResource {
  id: string;
  attributes: Record<string, unknown>;
}

// GET /admin/api/pos/products?store=… — товарная витрина кассы: продаваемые
// букеты точки + позиции каталога с розничной ценой, в лёгкой плоской форме.
export async function GET(request: NextRequest) {
  const store = request.nextUrl.searchParams.get('store');
  if (!store) {
    return NextResponse.json({ detail: 'store обязателен' }, { status: 400 });
  }

  const [bouquetsRes, itemsRes] = await Promise.all([
    adminMutate(
      `/api/v1/bouquets?filter[store]=${encodeURIComponent(store)}&page[size]=200&sort=-createdAt`,
      'GET',
      undefined,
    ),
    adminMutate('/api/v1/inventory-items?page[size]=500', 'GET', undefined),
  ]);
  if (!bouquetsRes.ok || !itemsRes.ok) {
    const status = !bouquetsRes.ok ? bouquetsRes.status : itemsRes.status;
    return NextResponse.json({ detail: 'Не удалось загрузить каталог' }, { status });
  }

  const bouquetsJson = await bouquetsRes.json().catch(() => ({ data: [] }));
  const itemsJson = await itemsRes.json().catch(() => ({ data: [] }));

  const bouquets = ((bouquetsJson.data || []) as JsonApiResource[])
    .filter((b) => !UNSELLABLE.has(String(b.attributes.status)))
    .map((b) => ({
      id: b.id,
      title: String(b.attributes.title || ''),
      price: Number(b.attributes.saleAmount) || 0,
    }))
    .filter((b) => b.price > 0);

  const items = ((itemsJson.data || []) as JsonApiResource[])
    .map((i) => ({
      id: i.id,
      title: String(i.attributes.title || ''),
      price: Number(i.attributes.priceMax) || Number(i.attributes.priceMin) || 0,
    }))
    .filter((i) => i.price > 0);

  return NextResponse.json({ bouquets, items });
}
