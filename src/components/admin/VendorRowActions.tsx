'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminVendor } from '@/types';
import VendorFormModal from './VendorFormModal';

interface Props {
  vendor: AdminVendor;
}

// ⋮ menu per vendor row (admin-map §2.4.4): Редактировать / Удалить. System
// vendors (Прямая поставка, Уценка, …) can't be deleted — the backend 400s
// it too, but hiding the option here avoids a round-trip for the obvious case.
export default function VendorRowActions({ vendor }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!window.confirm(`Удалить поставщика «${vendor.attributes.title}»?`)) return;
    setOpen(false);
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/admin/api/vendors/${vendor.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить поставщика');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setDeleting(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button" className="admin-btn" style={{ height: 28, padding: '0 8px' }}
        onClick={() => setOpen((v) => !v)} disabled={deleting} aria-label="Действия"
      >
        ⋮
      </button>
      {open && (
        <div className="admin-picker-list" style={{ position: 'absolute', right: 0, zIndex: 10, minWidth: 160 }}>
          <button type="button" className="admin-picker-row" onClick={() => { setOpen(false); setEditing(true); }}>
            Редактировать
          </button>
          {!vendor.attributes.isSystem && (
            <button type="button" className="admin-picker-row" onClick={handleDelete}>
              Удалить
            </button>
          )}
        </div>
      )}
      {error && <div className="admin-form-error" style={{ position: 'absolute', right: 0, whiteSpace: 'nowrap' }}>{error}</div>}
      {editing && (
        <VendorFormModal
          vendor={vendor}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
