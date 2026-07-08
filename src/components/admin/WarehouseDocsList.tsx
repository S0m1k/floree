import Link from 'next/link';
import {
  AdminWarehouseDoc, AdminWarehouseDocType, AdminVendor, SimpleDictEntry, Worker,
} from '@/types';
import { getDocConfig, buildWarehouseDocsHref, WarehouseDocsSearchParams, DOC_PAGE_SIZE } from '@/lib/adminWarehouseDocs';
import { fmtMoney, fmtDate } from '@/lib/format';

function relId(rel?: { data: { id: string } | null }): string | undefined {
  return rel?.data?.id;
}

interface Ctx {
  storesById: Record<string, SimpleDictEntry>;
  workersById: Record<string, Worker>;
  vendorsById: Record<string, AdminVendor>;
}

type Column = { label: string; render: (doc: AdminWarehouseDoc) => React.ReactNode };

// Column sets per document type (docs/posiflora/admin-map.md §2.4.3). A few
// fields the live Posiflora shows aren't in our JSON:API yet — each such
// column is commented at its render function.
function getColumns(docType: AdminWarehouseDocType, route: string, ctx: Ctx): Column[] {
  const store = (doc: AdminWarehouseDoc) => {
    const id = relId(doc.relationships.store);
    return id ? ctx.storesById[id]?.attributes.title || '—' : '—';
  };
  const author = (doc: AdminWarehouseDoc) => {
    const id = relId(doc.relationships.createdBy);
    return id ? ctx.workersById[id]?.attributes.name || '—' : '—';
  };
  const statusCol: Column = {
    label: 'Статус',
    render: (doc) => (
      <span className={`admin-doc-status admin-doc-status--${doc.attributes.posted ? 'posted' : 'draft'}`}>
        {doc.attributes.posted ? 'Проведён' : 'Черновик'}
      </span>
    ),
  };
  const numberCol: Column = {
    label: 'Номер',
    render: (doc) => <Link href={`/admin/${route}/${doc.id}`}>{doc.attributes.docNo || doc.id.slice(0, 8)}</Link>,
  };
  const linesCol: Column = { label: 'Товаров', render: (doc) => doc.attributes.linesCount };

  switch (docType) {
    case 'packing-invoices':
      return [
        statusCol, numberCol,
        { label: 'Дата', render: (d) => fmtDate(d.attributes.date) },
        { label: 'Сумма', render: (d) => fmtMoney(d.attributes.amount) },
        linesCol,
        {
          label: 'Поставщик',
          render: (d) => { const id = relId(d.relationships.vendor); return id ? ctx.vendorsById[id]?.attributes.title || '—' : '—'; },
        },
        { label: 'Точка продаж', render: store },
        { label: 'Сотрудник', render: author },
      ];
    case 'write-off-invoices':
      return [
        statusCol, numberCol,
        { label: 'Дата', render: (d) => fmtDate(d.attributes.date) },
        { label: 'Сумма', render: (d) => fmtMoney(d.attributes.amount) },
        linesCol,
        // The WriteoffInvoice.reason column (backend/app/inventory_models.py)
        // isn't emitted by writeoff_invoice_resource yet (serializers_docs.py)
        // — placeholder until the backend adds it to the attributes.
        { label: 'Причина списания', render: () => '—' },
        { label: 'Точка продаж', render: store },
        { label: 'Сотрудник', render: author },
      ];
    case 'markdown-acts':
      return [
        statusCol, numberCol,
        { label: 'Дата создания', render: (d) => fmtDate(d.attributes.date) },
        // The API stores a single `date` (created_date) per doc — posted_date
        // isn't serialized, so this falls back to the same date once posted.
        { label: 'Дата проведения', render: (d) => (d.attributes.posted ? fmtDate(d.attributes.date) : '—') },
        linesCol,
        { label: 'Точка продаж', render: store },
        { label: 'Автор', render: author },
      ];
    case 'sorting-acts':
      return [
        statusCol, numberCol,
        { label: 'Дата создания', render: (d) => fmtDate(d.attributes.date) },
        { label: 'Дата проведения', render: (d) => (d.attributes.posted ? fmtDate(d.attributes.date) : '—') },
        linesCol,
        { label: 'Точка продаж', render: store },
      ];
    case 'inventory-acts':
      return [
        statusCol, numberCol,
        { label: 'Дата акта', render: (d) => fmtDate(d.attributes.date) },
        { label: 'Дата проведения', render: (d) => (d.attributes.posted ? fmtDate(d.attributes.date) : '—') },
        linesCol,
        {
          label: 'Финансовый результат',
          render: (d) => `${d.attributes.amount >= 0 ? '+' : ''}${fmtMoney(d.attributes.amount)}`,
        },
        { label: 'Точка продаж', render: store },
        { label: 'Сотрудник', render: author },
      ];
    case 'movement-acts':
      return [
        statusCol, numberCol,
        { label: 'Дата', render: (d) => fmtDate(d.attributes.date) },
        {
          label: 'Откуда',
          render: (d) => { const id = relId(d.relationships.fromStore); return id ? ctx.storesById[id]?.attributes.title || '—' : '—'; },
        },
        {
          label: 'Куда',
          render: (d) => { const id = relId(d.relationships.toStore); return id ? ctx.storesById[id]?.attributes.title || '—' : '—'; },
        },
        { label: 'Себестоимость', render: (d) => fmtMoney(d.attributes.amount) },
        linesCol,
        { label: 'Сотрудник', render: author },
      ];
    default:
      return [statusCol, numberCol, linesCol];
  }
}

interface Props {
  docType: AdminWarehouseDocType;
  docs: AdminWarehouseDoc[];
  total: number;
  current: WarehouseDocsSearchParams;
  stores: SimpleDictEntry[];
  storesById: Record<string, SimpleDictEntry>;
  workersById: Record<string, Worker>;
  vendorsById?: Record<string, AdminVendor>;
}

export default function WarehouseDocsList({
  docType, docs, total, current, stores, storesById, workersById, vendorsById = {},
}: Props) {
  const cfg = getDocConfig(docType);
  const columns = getColumns(docType, cfg.route, { storesById, workersById, vendorsById });
  const page = Math.max(1, parseInt(current.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / DOC_PAGE_SIZE));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="admin-title" style={{ marginBottom: 0 }}>{cfg.title}</h1>
        <button className="admin-btn" disabled title="Пока недоступно" style={{ height: 36, marginBottom: 16 }}>
          {cfg.createLabel}
        </button>
      </div>

      {cfg.hasStoreFilter && (
        <form method="GET" action={`/admin/${cfg.route}`} className="admin-search" style={{ alignItems: 'center' }}>
          <select name="store" defaultValue={current.store || ''} className="admin-inline-select">
            <option value="">Все точки</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.attributes.title}</option>
            ))}
          </select>
          <button type="submit" className="admin-btn admin-btn--primary">Применить</button>
        </form>
      )}

      {docs.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Документы не найдены.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id}>{columns.map((c) => <td key={c.label}>{c.render(doc)}</td>)}</tr>
              ))}
            </tbody>
          </table>

          <div className="admin-pagination">
            <span>Найдено документов: {total}</span>
            <div className="admin-pagination__pages">
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 2px' }}>…</span>}
                    {p === page ? (
                      <span className="admin-pagination__current">{p}</span>
                    ) : (
                      <Link href={buildWarehouseDocsHref(cfg.route, current, { page: String(p) })}>{p}</Link>
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
