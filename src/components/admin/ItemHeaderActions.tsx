'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminInventoryItem } from '@/types';

// «Сгенерировать штрихкод» / «Удалить» — the item card's header actions
// (admin-map §2.3.4), mirroring the recipe card's SpecificationHeaderActions.
export default function ItemHeaderActions({ item }: { item: AdminInventoryItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateBarcode = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/admin/api/inventory-items/${item.id}/barcode`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сгенерировать штрихкод');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Удалить товар «${item.attributes.title}»?`)) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/admin/api/inventory-items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить товар');
      }
      router.push('/admin/catalog');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setBusy(false);
    }
  };

  return (
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="admin-form-actions" style={{ padding: 0 }}>
        <button type="button" className="admin-btn" onClick={generateBarcode} disabled={busy || Boolean(item.attributes.barcode)}>
          {item.attributes.barcode ? `Штрихкод: ${item.attributes.barcode}` : 'Сгенерировать штрихкод'}
        </button>
        <button type="button" className="admin-btn" onClick={handleDelete} disabled={busy}>
          Удалить
        </button>
      </div>
      {error && <div className="admin-form-error">{error}</div>}
    </div>
  );
}
