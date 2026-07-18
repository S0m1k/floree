import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';
import { customersFilterQuery, EXPORT_PAGE_SIZE, CustomersSearchParams } from '@/lib/adminCustomers';
import { customersToCsv } from '@/lib/customerCsv';
import { AdminCustomer } from '@/types';

// GET /admin/api/customers/export — CSV of the *current filtered selection*
// (admin-map §2.5.1 «Экспорт клиентов»), not the whole customer base. Reuses
// the same filter[...] query the list page sends, so the export always
// matches whatever the admin is looking at.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params: CustomersSearchParams = Object.fromEntries(url.searchParams.entries());

  const qs = customersFilterQuery(params);
  qs.set('page[number]', '1');
  qs.set('page[size]', String(EXPORT_PAGE_SIZE));

  const res = await adminFetch(`/api/v1/customers?${qs.toString()}`);
  if (!res.ok) {
    return NextResponse.json({ detail: 'Не удалось выгрузить клиентов' }, { status: res.status });
  }
  const json = await res.json();
  const customers: AdminCustomer[] = json.data || [];

  const csv = customersToCsv(customers);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="customers.csv"',
    },
  });
}
