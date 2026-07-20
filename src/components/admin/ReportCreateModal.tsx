'use client';

import { useState } from 'react';
import { ReportType } from '@/types';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'payments', label: 'Оплаты' },
  { value: 'sales', label: 'Продажи' },
  { value: 'vendors', label: 'Поставщики' },
  { value: 'goods-flow', label: 'Движение товаров' },
  { value: 'bouquets', label: 'Букеты' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthAgoIso = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};

// «Создать отчёт» modal (admin-map §2.4.6): report type + period.
export default function ReportCreateModal({ onClose, onSaved }: Props) {
  const [type, setType] = useState<ReportType>('sales');
  const [from, setFrom] = useState(monthAgoIso());
  const [to, setTo] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!from || !to) { setError('Укажите период'); return; }
    if (from > to) { setError('Начало периода не может быть позже окончания'); return; }

    setSaving(true);
    try {
      const res = await fetch('/admin/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'generated-files', attributes: { type, from, to } } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось создать отчёт');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Создать отчёт">
      <div className="admin-modal" style={{ width: 460 }}>
        <div className="admin-modal__head">
          <p className="admin-modal__title">Создать отчёт</p>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <form onSubmit={save}>
          <div className="admin-modal__body">
            <div className="admin-field">
              <label htmlFor="rep-type">Тип отчёта *</label>
              <select id="rep-type" value={type} onChange={(e) => setType(e.target.value as ReportType)} autoFocus>
                {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="admin-field-grid">
              <div className="admin-field">
                <label htmlFor="rep-from">Период с *</label>
                <input id="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
              </div>
              <div className="admin-field">
                <label htmlFor="rep-to">Период по *</label>
                <input id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
              </div>
            </div>
            {error && <div className="admin-form-error">{error}</div>}
          </div>
          <div className="admin-form-actions" style={{ padding: '0 20px 20px' }}>
            <button type="button" className="admin-btn" onClick={onClose} disabled={saving}>Отмена</button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? 'Формируем…' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
