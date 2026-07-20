import { NextRequest, NextResponse } from 'next/server';
import { getExpenses, EXPENSE_EXPORT_PAGE_SIZE } from '@/lib/adminFinance';
import { getStores } from '@/lib/adminOrders';

// GET /admin/api/expenses/export — «Скачать в Эксель» on
// /admin/financial-accounting «Список расходов» (admin-map §2.4.7). Streams
// the current filtered selection (same from/to/store/q params as the list)
// as a CSV, matching the customers/items export convention (BOM + `;`).

const CSV_HEADER = ['#', 'Статья', 'Сумма', 'Дата', 'Точка', 'Комментарий'];

function csvCell(value: string): string {
  const needsQuoting = /[",\n;]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const store = searchParams.get('store') || undefined;
  const q = searchParams.get('q') || undefined;

  const [{ expenses }, stores] = await Promise.all([
    getExpenses({ from, to, store, q, page: '1' }),
    getStores(),
  ]);
  const storesById = Object.fromEntries(stores.map((s) => [s.id, s.attributes.title]));

  const rows = expenses.slice(0, EXPENSE_EXPORT_PAGE_SIZE).map((e, i) => {
    const a = e.attributes;
    const storeId = e.relationships?.store?.data?.id;
    return [
      String(i + 1),
      a.article,
      String(a.amount),
      a.date,
      (storeId && storesById[storeId]) || '',
      a.comment || '',
    ];
  });

  const lines = [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(';'));
  const csv = '﻿' + lines.join('\r\n') + '\r\n';

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="expenses-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
