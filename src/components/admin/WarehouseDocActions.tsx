'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminWarehouseDocType } from '@/types';
import { getDocConfig } from '@/lib/warehouseDocsConfig';

interface Props {
  docType: AdminWarehouseDocType;
  docId: string;
  posted: boolean;
}

// «Провести» / «Удалить» — only meaningful for a draft (admin-map §2.4.3): a
// posted document is read-only (the backend 409s any further edit/post/
// delete on it). Both actions hit the generic warehouse-docs proxy and
// refresh the server-rendered card in place.
export default function WarehouseDocActions({ docType, docId, posted }: Props) {
  const router = useRouter();
  const cfg = getDocConfig(docType);
  const [busy, setBusy] = useState<'post' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (posted) return null;

  const handlePost = async () => {
    setError(null);
    setBusy('post');
    try {
      const res = await fetch(`/admin/api/warehouse-docs/${cfg.apiPath}/${docId}/post`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось провести документ');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Удалить черновик документа?')) return;
    setError(null);
    setBusy('delete');
    try {
      const res = await fetch(`/admin/api/warehouse-docs/${cfg.apiPath}/${docId}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить документ');
      }
      router.push(`/admin/${cfg.route}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="admin-btn admin-btn--primary" onClick={handlePost} disabled={busy !== null}>
        {busy === 'post' ? 'Проводим…' : 'Провести'}
      </button>
      <button type="button" className="admin-btn" onClick={handleDelete} disabled={busy !== null}>
        {busy === 'delete' ? 'Удаляем…' : 'Удалить'}
      </button>
      {error && <span className="admin-form-error" style={{ margin: 0 }}>{error}</span>}
    </div>
  );
}
