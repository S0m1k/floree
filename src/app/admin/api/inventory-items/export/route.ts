import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';
import { getCategories } from '@/lib/adminCatalog';
import { getMeasures } from '@/lib/adminInventory';
import { AdminInventoryItem } from '@/types';

// GET /admin/api/inventory-items/export — «Экспортировать продукты»
// (admin-map §2.3.4). Streams the current filtered selection (same
// `category`/`q` params as the catalog page) as a CSV file. A UTF-8 BOM is
// prepended so Excel opens Cyrillic headers/values without mangling them.

const CSV_HEADER = [
  'ID', 'Название', 'Тип', 'Категория', 'Ед. изм.', 'Мин. цена', 'Макс. цена',
  'Штрихкод', 'Активность', 'В магазине', 'Связь со справочником',
];

function csvCell(value: string): string {
  const needsQuoting = /[",\n;]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const q = (searchParams.get('q') || '').trim().toLowerCase();

  const qs = new URLSearchParams();
  if (category) qs.set('filter[category]', category);
  qs.set('page[size]', '2000');

  const [itemsRes, categories, measures] = await Promise.all([
    adminFetch(`/api/v1/inventory-items?${qs.toString()}`),
    getCategories(),
    getMeasures(),
  ]);
  if (!itemsRes.ok) {
    return NextResponse.json({ detail: 'Не удалось получить товары' }, { status: itemsRes.status });
  }
  const json = await itemsRes.json();
  let items: AdminInventoryItem[] = json.data || [];
  if (q) items = items.filter((i) => i.attributes.title.toLowerCase().includes(q));

  const categoriesById = Object.fromEntries(categories.map((c) => [c.id, c.attributes.title]));
  const measuresById = Object.fromEntries(measures.map((m) => [m.id, m.attributes.title]));

  const rows = items.map((item) => {
    const a = item.attributes;
    const categoryTitle = item.relationships.category?.data?.id
      ? categoriesById[item.relationships.category.data.id] || ''
      : '';
    const measureTitle = item.relationships.measure?.data?.id
      ? measuresById[item.relationships.measure.data.id] || ''
      : '';
    return [
      item.id,
      a.title,
      a.itemType === 'service' ? 'Услуга' : 'Товар',
      categoryTitle,
      measureTitle,
      String(a.priceMin),
      String(a.priceMax),
      a.barcode || '',
      a.status === 'off' ? 'Неактивен' : 'Активен',
      a.public ? 'Добавлен' : 'Не добавлен',
      a.globalId ? 'POSIFLORA' : 'Не связано',
    ];
  });

  const lines = [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(';'));
  const csv = '﻿' + lines.join('\r\n') + '\r\n';

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="catalog-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
