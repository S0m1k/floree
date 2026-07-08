import Link from 'next/link';
import {
  AdminWarehouseDoc, AdminWarehouseDocLine, AdminWarehouseDocType,
  AdminInventoryItem, AdminVendor, SimpleDictEntry, Worker,
} from '@/types';
import { getDocConfig } from '@/lib/adminWarehouseDocs';
import { fmtMoney, fmtDate } from '@/lib/format';

function relId(rel?: { data: { id: string } | null }): string | undefined {
  return rel?.data?.id;
}

function itemTitle(id: string | undefined, itemsById: Record<string, AdminInventoryItem>): string {
  if (!id) return '—';
  return itemsById[id]?.attributes.title || '—';
}

type LineColumn = { label: string; render: (line: AdminWarehouseDocLine) => React.ReactNode };

// Line-item column sets per document type. `item` isn't included in the
// detail response (backend/app/routers/v1_warehouse_docs.py only includes the
// line resources themselves), so titles come from a separately fetched
// id->item map (src/lib/adminInventory.ts getAllInventoryItemsMap).
function getLineColumns(docType: AdminWarehouseDocType, itemsById: Record<string, AdminInventoryItem>): LineColumn[] {
  const nameCol: LineColumn = { label: 'Наименование', render: (l) => itemTitle(relId(l.relationships.item), itemsById) };
  const qtyCol: LineColumn = { label: 'Кол-во', render: (l) => String(l.attributes.qty ?? '—') };

  switch (docType) {
    case 'packing-invoices':
      return [
        nameCol, qtyCol,
        { label: 'Цена', render: (l) => fmtMoney(Number(l.attributes.cost) || 0) },
        { label: 'Сумма', render: (l) => fmtMoney(Number(l.attributes.amount) || 0) },
      ];
    case 'write-off-invoices':
      return [
        nameCol, qtyCol,
        { label: 'Себестоимость', render: (l) => fmtMoney(Number(l.attributes.cost) || 0) },
        { label: 'Сумма', render: (l) => fmtMoney((Number(l.attributes.qty) || 0) * (Number(l.attributes.cost) || 0)) },
      ];
    case 'markdown-acts':
      return [
        nameCol, qtyCol,
        { label: 'Старая цена', render: (l) => fmtMoney(Number(l.attributes.oldPrice) || 0) },
        { label: 'Новая цена', render: (l) => fmtMoney(Number(l.attributes.newPrice) || 0) },
      ];
    case 'sorting-acts':
      return [
        { label: 'Из', render: (l) => itemTitle(relId(l.relationships.itemFrom), itemsById) },
        { label: 'В', render: (l) => itemTitle(relId(l.relationships.itemTo), itemsById) },
        qtyCol,
      ];
    case 'inventory-acts':
      return [
        nameCol,
        { label: 'Учётное кол-во', render: (l) => String(l.attributes.expectedQty ?? '—') },
        { label: 'Фактическое кол-во', render: (l) => String(l.attributes.qty ?? '—') },
      ];
    case 'movement-acts':
      return [
        nameCol, qtyCol,
        { label: 'Себестоимость', render: (l) => fmtMoney(Number(l.attributes.cost) || 0) },
        { label: 'Сумма', render: (l) => fmtMoney((Number(l.attributes.qty) || 0) * (Number(l.attributes.cost) || 0)) },
      ];
    default:
      return [nameCol, qtyCol];
  }
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-metric-card">
      <div className="admin-metric-card__label">{label}</div>
      <div className="admin-metric-card__value" style={{ fontSize: 16 }}>{value}</div>
    </div>
  );
}

interface Props {
  docType: AdminWarehouseDocType;
  doc: AdminWarehouseDoc;
  lines: AdminWarehouseDocLine[];
  itemsById: Record<string, AdminInventoryItem>;
  storesById: Record<string, SimpleDictEntry>;
  workersById: Record<string, Worker>;
  vendorsById?: Record<string, AdminVendor>;
}

export default function WarehouseDocCard({
  docType, doc, lines, itemsById, storesById, workersById, vendorsById = {},
}: Props) {
  const cfg = getDocConfig(docType);
  const a = doc.attributes;
  const storeId = relId(doc.relationships.store);
  const fromId = relId(doc.relationships.fromStore);
  const toId = relId(doc.relationships.toStore);
  const vendorId = relId(doc.relationships.vendor);
  const authorId = relId(doc.relationships.createdBy);
  const lineColumns = getLineColumns(docType, itemsById);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link href={`/admin/${cfg.route}`} className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>{cfg.singular} № {a.docNo || doc.id.slice(0, 8)}</h1>
        <span className={`admin-doc-status admin-doc-status--${a.posted ? 'posted' : 'draft'}`}>
          {a.posted ? 'Проведён' : 'Черновик'}
        </span>
      </div>

      <div className="admin-metric-grid">
        <MetricCard label="Дата" value={fmtDate(a.date)} />
        <MetricCard label="Сумма" value={fmtMoney(a.amount)} />
        <MetricCard label="Товаров" value={String(a.linesCount)} />
        {storeId && <MetricCard label="Точка продаж" value={storesById[storeId]?.attributes.title || '—'} />}
        {fromId && <MetricCard label="Откуда" value={storesById[fromId]?.attributes.title || '—'} />}
        {toId && <MetricCard label="Куда" value={storesById[toId]?.attributes.title || '—'} />}
        {vendorId && <MetricCard label="Поставщик" value={vendorsById[vendorId]?.attributes.title || '—'} />}
        {authorId && <MetricCard label="Сотрудник" value={workersById[authorId]?.attributes.name || '—'} />}
      </div>

      <p className="admin-section-title">Позиции</p>
      {lines.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Нет позиций.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>{lineColumns.map((c) => <th key={c.label}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>{lineColumns.map((c) => <td key={c.label}>{c.render(line)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
