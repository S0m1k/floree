import Link from 'next/link';
import { getVendors, buildVendorsHref, VendorsSearchParams, PAGE_SIZE } from '@/lib/adminVendors';
import WarehouseNav from '@/components/admin/WarehouseNav';

export const metadata = { title: 'Поставщики' };

interface Props {
  searchParams: VendorsSearchParams;
}

export default async function AdminVendorsPage({ searchParams }: Props) {
  const { vendors, total } = await getVendors(searchParams);
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <WarehouseNav active="/admin/vendors" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="admin-title" style={{ marginBottom: 0 }}>Поставщики</h1>
        <button className="admin-btn" disabled title="Пока недоступно" style={{ height: 36, marginBottom: 16 }}>
          Создать поставщика
        </button>
      </div>

      {vendors.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Поставщики не найдены.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Телефон</th>
                <th>Электронный адрес</th>
                <th>Комментарий</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const a = v.attributes;
                return (
                  <tr key={v.id}>
                    <td>{a.title}</td>
                    <td>{a.phone || '—'}</td>
                    <td>{a.email || '—'}</td>
                    <td>{a.description || '—'}</td>
                    <td><button className="admin-btn" disabled style={{ height: 28, padding: '0 8px' }}>⋮</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="admin-pagination">
            <span>Найдено поставщиков: {total}</span>
            <div className="admin-pagination__pages">
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 2px' }}>…</span>}
                    {p === page ? (
                      <span className="admin-pagination__current">{p}</span>
                    ) : (
                      <Link href={buildVendorsHref(searchParams, { page: String(p) })}>{p}</Link>
                    )}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
