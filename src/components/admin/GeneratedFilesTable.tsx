import { AdminGeneratedFile } from '@/types';
import { fmtDateTime } from '@/lib/format';

interface Props {
  files: AdminGeneratedFile[];
  count: number;
  showKindColumn?: boolean;
}

const KIND_LABELS: Record<string, string> = {
  'customers-export': 'Клиенты',
  'items-export': 'Товары',
  'report:payments': 'Отчёт «Оплаты»',
  'report:sales': 'Отчёт «Продажи»',
  'report:vendors': 'Отчёт «Поставщики»',
  'report:goods-flow': 'Отчёт «Движение товаров»',
  'report:bouquets': 'Отчёт «Букеты»',
};

const STATUS_LABELS: Record<string, string> = { done: 'Готово', pending: 'В процессе', failed: 'Ошибка' };

// Shared table for /admin/exports-list (admin-map §2.4.8, all kinds) and
// /admin/items-export (§2.4.5, kind=items-export only — no «Тип» column
// since every row is already a product export).
export default function GeneratedFilesTable({ files, count, showKindColumn = true }: Props) {
  if (files.length === 0) {
    return <div className="admin-table-wrap"><div className="admin-empty">Выгрузок пока нет.</div></div>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Статус</th>
            {showKindColumn && <th>Тип</th>}
            <th>Создано</th>
            <th aria-label="Скачать" />
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id}>
              <td>{fmtDateTime(f.attributes.createdAt)}</td>
              <td>{STATUS_LABELS[f.attributes.status] || f.attributes.status}</td>
              {showKindColumn && <td>{KIND_LABELS[f.attributes.kind] || f.attributes.kind}</td>}
              <td>{f.attributes.title}</td>
              <td>
                <a
                  href={
                    f.attributes.kind.startsWith('report:')
                      ? `/admin/api/reports/${f.id}/download`
                      : `/admin/api/generated-files/${f.id}/download`
                  }
                  className="admin-btn admin-btn--primary"
                >
                  Скачать
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="admin-pagination"><span>Найдено выгрузок: {count}</span></div>
    </div>
  );
}
