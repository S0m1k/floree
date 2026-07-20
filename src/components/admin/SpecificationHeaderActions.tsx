'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  specId: string;
  isPublic: boolean;
  isArchived: boolean;
}

// «Скрыть/показать в интернет магазине» + «Перенести в архив» / «Вернуть из
// архива» — the recipe card's header actions (admin-map §2.3.2).
export default function SpecificationHeaderActions({ specId, isPublic, isArchived }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const patch = async (attributes: Record<string, unknown>) => {
    setBusy(true);
    await fetch(`/admin/api/specifications/${specId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { attributes } }),
    });
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="admin-form-actions" style={{ padding: 0, marginLeft: 'auto' }}>
      <button
        type="button"
        className="admin-btn"
        onClick={() => patch({ public: !isPublic })}
        disabled={busy}
      >
        {isPublic ? 'Скрыть в интернет магазине' : 'Показать в интернет магазине'}
      </button>
      <button
        type="button"
        className="admin-btn"
        onClick={() => patch({ status: isArchived ? 'on' : 'off' })}
        disabled={busy}
      >
        {isArchived ? 'Вернуть из архива' : 'Перенести в архив'}
      </button>
    </div>
  );
}
