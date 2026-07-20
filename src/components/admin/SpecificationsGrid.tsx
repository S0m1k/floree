'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminSpecification } from '@/types';

// Local, deliberately loose shapes — this is a client component so it can't
// import the server-side JsonApiImage/DictEntry types (they live in modules
// that pull in `next/headers`). Structurally compatible with what
// getSpecifications() returns, which is all that's needed here.
interface RecipeCardImage {
  id: string;
  attributes: { fileShop: string | null; file: string | null };
}
interface RecipeCardTag {
  id: string;
  attributes: { title: string };
}

interface Props {
  specifications: AdminSpecification[];
  imagesById: Record<string, RecipeCardImage>;
  tagsById: Record<string, RecipeCardTag>;
}

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

function specImageUrl(spec: AdminSpecification, imagesById: Record<string, RecipeCardImage>): string | null {
  const logoId = spec.relationships?.logo?.data?.id;
  if (!logoId) return null;
  const img = imagesById[logoId];
  if (!img) return null;
  return img.attributes.fileShop || img.attributes.file;
}

type BulkAction = 'archive' | 'unarchive' | 'publish' | 'unpublish';

const BULK_ACTIONS: { action: BulkAction; label: string }[] = [
  { action: 'archive', label: 'Перенести в архив' },
  { action: 'unarchive', label: 'Вернуть из архива' },
  { action: 'publish', label: 'Показать на сайте' },
  { action: 'unpublish', label: 'Скрыть с сайта' },
];

// Card grid (admin-map §2.3.6 «Рецепты») with multi-select + bulk actions.
// The card used to be one big <Link> — the checkbox now sits outside the
// anchor (a sibling, absolutely positioned over the photo corner) so it can
// be clicked without triggering navigation; only the photo+title area is
// wrapped in the <Link>.
export default function SpecificationsGrid({ specifications, imagesById, tagsById }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [runningAction, setRunningAction] = useState<BulkAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = specifications.length > 0 && specifications.every((s) => selected.has(s.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(specifications.map((s) => s.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const runBulkAction = async (action: BulkAction) => {
    if (selected.size === 0 || runningAction) return;
    setRunningAction(action);
    setError(null);
    try {
      const res = await fetch('/admin/api/specifications/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось выполнить действие');
      }
      clearSelection();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div>
      <div className="admin-select-all">
        <label className="admin-checkbox">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Выбрать все рецепты
        </label>
      </div>

      {selected.size > 0 && (
        <div className="admin-bulk-bar">
          <span className="admin-bulk-bar__count">Выбрано: {selected.size}</span>
          {BULK_ACTIONS.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              className="admin-btn"
              disabled={runningAction !== null}
              onClick={() => runBulkAction(action)}
            >
              {runningAction === action ? 'Выполняем…' : label}
            </button>
          ))}
          <button
            type="button"
            className="admin-bulk-bar__clear"
            disabled={runningAction !== null}
            onClick={clearSelection}
          >
            Снять выделение
          </button>
        </div>
      )}

      {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="admin-card-grid">
        {specifications.map((spec) => {
          const a = spec.attributes;
          const imageUrl = specImageUrl(spec, imagesById);
          const priceRange = a.minPrice === a.maxPrice
            ? fmtMoney(a.minPrice)
            : `${fmtMoney(a.minPrice)} – ${fmtMoney(a.maxPrice)}`;
          const tags = (spec.relationships.recipeTags?.data || [])
            .map((d) => tagsById[d.id])
            .filter((t): t is RecipeCardTag => Boolean(t));
          const isSelected = selected.has(spec.id);

          return (
            <div key={spec.id} className={`admin-recipe-card ${isSelected ? 'admin-recipe-card--selected' : ''}`}>
              <label className="admin-recipe-card__select">
                <input type="checkbox" checked={isSelected} onChange={() => toggleOne(spec.id)} />
              </label>
              <Link href={`/admin/specifications/${spec.id}`} className="admin-recipe-card__link">
                <div className="admin-recipe-card__photo">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external Posiflora CDN images, not under next/image domains
                    <img src={imageUrl} alt={a.title} />
                  ) : (
                    <span className="material-symbols-outlined admin-recipe-card__placeholder">local_florist</span>
                  )}
                  <span className={`admin-recipe-card__status admin-recipe-card__status--${a.public ? 'on' : 'off'}`}>
                    {a.public ? 'На сайте' : 'Не на сайте'}
                  </span>
                </div>
                <div className="admin-recipe-card__body">
                  {tags.length > 0 && (
                    <div className="admin-recipe-card__tags">
                      {tags.map((t) => (
                        <span key={t.id} className="admin-recipe-card__tag">{t.attributes.title}</span>
                      ))}
                    </div>
                  )}
                  <div className="admin-recipe-card__title">{a.title}</div>
                  <div className="admin-recipe-card__price">{priceRange}</div>
                  <div className="admin-recipe-card__variants">{a.variantsCount} вариант(ов)</div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
