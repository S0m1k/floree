'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmtMoney } from './PosTerminal';

interface Recipe {
  id: string;
  title: string;
  variant: string | null;
  price: number;
}

interface Props {
  storeId: string;
  onClose: () => void;
  onAssembled: (title: string) => void;
}

// «Собрать букет»: выбор рецепта (вариант + цена точки) → букет на витрине.
// Если у рецепта заполнен состав — компоненты спишутся со склада.
export default function PosRecipePicker({ storeId, onClose, onAssembled }: Props) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/admin/api/pos/recipes?store=${encodeURIComponent(storeId)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || 'Не удалось загрузить рецепты');
        if (!cancelled) {
          setRecipes((json.data || []).map((r: any) => ({
            id: r.id,
            title: r.attributes.title,
            variant: r.attributes.variant,
            price: Number(r.attributes.price) || 0,
          })));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      }
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  const shown = useMemo(() => {
    if (!recipes) return [];
    const q = query.trim().toLowerCase();
    return q ? recipes.filter((r) => r.title.toLowerCase().includes(q)) : recipes;
  }, [recipes, query]);

  const assemble = async (recipe: Recipe) => {
    setBusyId(recipe.id);
    setError(null);
    try {
      const res = await fetch('/admin/api/pos/bouquets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, swvId: recipe.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось собрать букет');
      }
      onAssembled(json.data?.attributes?.title || recipe.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
      setBusyId(null);
    }
  };

  return (
    <div className="pos-modal" role="dialog" aria-modal="true" aria-label="Собрать букет">
      <div className="pos-modal__card pos-order-sheet">
        <h2>Собрать букет</h2>
        <input
          type="text"
          className="pos__search"
          placeholder="Поиск рецепта…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {error && <div className="pos__error" onClick={() => setError(null)}>{error}</div>}
        {recipes === null && !error && <div className="pos__empty">Загрузка…</div>}
        {recipes !== null && shown.length === 0 && (
          <div className="pos__empty">Рецепты не найдены</div>
        )}

        <ul className="pos-recipe-list">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="pos-recipe-list__row"
                onClick={() => assemble(r)}
                disabled={busyId !== null}
              >
                <span className="pos-recipe-list__title">
                  {r.title}
                  {r.variant && <span className="pos-recipe-list__variant"> · {r.variant}</span>}
                </span>
                <span className="pos-recipe-list__price">
                  {busyId === r.id ? 'Собираем…' : fmtMoney(r.price)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="pos-modal__actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busyId !== null}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
