'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StockRow } from '@/lib/adminInventory';

interface Props {
  storeId: string;
  rows: StockRow[];
}

// Форма инвентаризации: пересчёт фактических остатков по всем товарам.
// Заполняются только изменённые строки — пустое поле означает «не пересчитывал,
// оставить как есть» (строка не попадает в акт).
export default function InventoryCountForm({ storeId, rows }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.attributes.title.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const filled = Object.entries(counted).filter(([, v]) => v.trim() !== '');

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const lines = filled.map(([itemId, v]) => ({ itemId, actualQty: Number(v) }));
      const res = await fetch('/admin/api/stock/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, lines }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось провести инвентаризацию');
      }
      router.push('/admin/warehouse');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="admin-search" style={{ alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Поиск товара…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={submit}
          disabled={busy || filled.length === 0}
        >
          {busy ? 'Проводим…' : `Провести (${filled.length} поз.)`}
        </button>
      </div>

      {error && <div className="pos__error" style={{ marginBottom: 10 }}>{error}</div>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Учётный остаток</th>
              <th>Фактически пересчитано</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id}>
                <td>{row.attributes.title}</td>
                <td>{row.attributes.quantity}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    placeholder="—"
                    value={counted[row.id] ?? ''}
                    onChange={(e) => setCounted((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    style={{ width: 110, padding: '6px 8px', border: '1px solid var(--admin-border)', borderRadius: 6 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
