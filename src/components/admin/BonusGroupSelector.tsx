'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminBonusGroup } from '@/types';

interface Props {
  customerId: string;
  groups: AdminBonusGroup[];
  currentGroupId: string | null;
}

// Бонусная группа на вкладке «Бонусы» карточки клиента (admin-map §2.5.1):
// select of bonus-groups → PATCH /admin/api/customers/[id] with
// relationships.bonusGroup. The backend logs the change to
// customer_bonus_group_history with the author from the JWT.
export default function BonusGroupSelector({ customerId, groups, currentGroupId }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(currentGroupId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: string) => {
    const previous = value;
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'customers',
            relationships: {
              bonusGroup: { data: next ? { type: 'bonus-groups', id: next } : null },
            },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось изменить бонусную группу');
      }
      router.refresh();
    } catch (err) {
      setValue(previous);
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <select value={value} disabled={busy} onChange={(e) => save(e.target.value)} aria-label="Бонусная группа">
        <option value="">Без группы</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.attributes.title}</option>
        ))}
      </select>
      {error && <span className="admin-status-control__error">{error}</span>}
    </span>
  );
}
