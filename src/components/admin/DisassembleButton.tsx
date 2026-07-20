'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// «Разобрать букет» (admin-map §2.3.1) — confirm, then PATCH the bouquet's
// status to 'disassembled'. The backend only allows this from the showcase
// ("window") status; a sold bouquet is a 409 (see backend/app/routers/v1_sales.py
// update_bouquet_v1), surfaced here rather than silently ignored.
export default function DisassembleButton({ bouquetId, title }: { bouquetId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disassemble = async () => {
    if (!window.confirm(`Разобрать букет «${title}»? Это действие нельзя отменить.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/bouquets/${bouquetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'bouquets', attributes: { status: 'disassembled' } } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось разобрать букет');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-showcase-card__disassemble-wrap">
      <button
        type="button"
        className="admin-showcase-card__disassemble"
        onClick={disassemble}
        disabled={busy}
      >
        Разобрать букет
      </button>
      {error && <span className="admin-showcase-card__error">{error}</span>}
    </div>
  );
}
