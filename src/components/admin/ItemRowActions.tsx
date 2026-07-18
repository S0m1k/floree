'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminInventoryItem } from '@/types';

// ⋮ menu per catalog row (admin-map §2.3.4): Редактировать / Сгенерировать
// штрихкод / Удалить. Delete is a soft delete on the backend — a 409 means
// the item is referenced by a document/recipe/order and can't be removed.
export default function ItemRowActions({ item }: { item: AdminInventoryItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateBarcode = async () => {
    setOpen(false);
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
    setOpen(false);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/admin/api/inventory-items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить товар');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button" className="admin-btn" style={{ height: 28, padding: '0 8px' }}
        onClick={() => setOpen((v) => !v)} disabled={busy} aria-label="Действия"
      >
        ⋮
      </button>
      {open && (
        <div className="admin-picker-list" style={{ position: 'absolute', right: 0, zIndex: 10, minWidth: 200 }}>
          <Link href={`/admin/catalog/${item.id}`} className="admin-picker-row" onClick={() => setOpen(false)}>
            Редактировать
          </Link>
          <button type="button" className="admin-picker-row" onClick={generateBarcode} disabled={Boolean(item.attributes.barcode)}>
            {item.attributes.barcode ? 'Штрихкод уже есть' : 'Сгенерировать штрихкод'}
          </button>
          <button type="button" className="admin-picker-row" onClick={handleDelete}>
            Удалить
          </button>
        </div>
      )}
      {error && <div className="admin-form-error" style={{ position: 'absolute', right: 0, whiteSpace: 'nowrap' }}>{error}</div>}
    </div>
  );
}
