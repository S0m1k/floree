'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminSpecification } from '@/types';

interface Props {
  specifications: AdminSpecification[];
  total: number;
}

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

// «Публикация на сайте» block (admin-map §2.3.2) — a compact
// Название | Цена | На сайте table, not the full recipe card grid.
// Toggling reuses the same PATCH /v1/specifications/{id} `public` field the
// recipe card's «Скрыть/показать в интернет магазине» action already uses.
export default function ShopPublicationTable({ specifications, total }: Props) {
  const [rows, setRows] = useState(specifications);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) => s.attributes.title.toLowerCase().includes(q));
  }, [rows, search]);

  const togglePublic = async (spec: AdminSpecification) => {
    const nextPublic = !spec.attributes.public;
    setError(null);
    setBusyId(spec.id);
    // Optimistic update — revert on failure.
    setRows((prev) => prev.map((s) => (s.id === spec.id ? { ...s, attributes: { ...s.attributes, public: nextPublic } } : s)));
    try {
      const res = await fetch(`/admin/api/specifications/${spec.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { attributes: { public: nextPublic } } }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось обновить публикацию');
      }
    } catch (err) {
      setRows((prev) => prev.map((s) => (s.id === spec.id ? { ...s, attributes: { ...s.attributes, public: spec.attributes.public } } : s)));
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <input
        type="text"
        className="admin-shop-publication__search"
        placeholder="Поиск по названию рецепта…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <div className="admin-form-error admin-dict-error">{error}</div>}

      {filtered.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Рецепты не найдены.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Цена</th>
                <th>На сайте</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const a = s.attributes;
                const price = a.minPrice === a.maxPrice ? fmtMoney(a.minPrice) : `${fmtMoney(a.minPrice)} – ${fmtMoney(a.maxPrice)}`;
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/admin/specifications/${s.id}`}>{a.title}</Link>
                    </td>
                    <td className="admin-shop-publication__price">{price}</td>
                    <td>
                      <label className="admin-switch">
                        <input
                          type="checkbox"
                          checked={a.public}
                          disabled={busyId === s.id}
                          onChange={() => togglePublic(s)}
                        />
                        <span className="admin-switch__track" />
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > rows.length && (
        <p className="admin-shop-publication__note">
          Показаны первые {rows.length} из {total} рецептов. Полный список — на{' '}
          <Link href="/admin/specifications">странице «Рецепты»</Link>.
        </p>
      )}
    </div>
  );
}
