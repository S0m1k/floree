'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminGeneratedFile, ReportType } from '@/types';
import { ReportsSearchParams } from '@/lib/adminFinance';
import { fmtDate, fmtDateTime } from '@/lib/format';
import ReportCreateModal from './ReportCreateModal';

interface Props {
  reports: AdminGeneratedFile[];
  count: number;
  current: ReportsSearchParams;
}

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'payments', label: 'Оплаты' },
  { value: 'sales', label: 'Продажи' },
  { value: 'vendors', label: 'Поставщики' },
  { value: 'goods-flow', label: 'Движение товаров' },
  { value: 'bouquets', label: 'Букеты' },
];

function periodLabel(f: AdminGeneratedFile): string {
  const a = f.attributes;
  if (!a.periodFrom || !a.periodTo) return '—';
  return `${fmtDate(a.periodFrom)} — ${fmtDate(a.periodTo)}`;
}

export default function ReportsTable({ reports, count, current }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = async (report: AdminGeneratedFile) => {
    setError(null);
    setBusyId(report.id);
    try {
      const res = await fetch(`/admin/api/reports/${report.id}/refresh`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось обновить отчёт');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => setCreating(true)}>
          Создать отчёт
        </button>
        <button type="button" className="admin-btn" disabled title="Скоро">Выгрузить в 1С</button>
      </div>

      <form method="GET" action="/admin/reports" className="admin-search" style={{ flexWrap: 'wrap' }}>
        <select name="type" defaultValue={current.type || ''} className="admin-inline-select">
          <option value="">Все типы</option>
          {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          type="text" name="q" defaultValue={current.q || ''}
          placeholder="Поиск по названию…" style={{ flex: 1, minWidth: 180 }}
        />
        <button type="submit" className="admin-btn admin-btn--primary">Применить</button>
      </form>

      {error && <div className="admin-form-error admin-dict-error">{error}</div>}

      {reports.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Отчётов пока нет.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название отчёта</th>
                <th>Период</th>
                <th>Формат</th>
                <th>Дата формирования</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.attributes.title}</td>
                  <td>{periodLabel(r)}</td>
                  <td>Эксель (CSV)</td>
                  <td>{fmtDateTime(r.attributes.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button" className="admin-btn"
                        onClick={() => handleRefresh(r)} disabled={busyId === r.id}
                      >
                        Обновить
                      </button>
                      <button type="button" className="admin-btn" disabled title="Скоро">Отправить</button>
                      <a href={`/admin/api/reports/${r.id}/download`} className="admin-btn admin-btn--primary">
                        Скачать
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="admin-pagination"><span>Найдено отчётов: {count}</span></div>
        </div>
      )}

      {creating && (
        <ReportCreateModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
