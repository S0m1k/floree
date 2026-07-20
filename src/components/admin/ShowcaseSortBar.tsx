import Link from 'next/link';
import { buildShowcaseHref, ShowcaseSearchParams } from '@/lib/showcaseHref';

interface SortOption {
  key: string;
  label: string;
  asc: string;
  desc: string;
  defaultGlyph: string;
}

// «Сортировать»: по цене / по названию / по новизне (admin-map §2.3.1). A
// click on the active option flips its direction; a click on an inactive one
// switches to it. Novelty's glyph convention is inverted vs price/title on
// the live screen (newest-first reads as an up-triangle, not down).
const OPTIONS: SortOption[] = [
  { key: 'amount', label: 'по цене', asc: 'amount', desc: '-amount', defaultGlyph: '▾' },
  { key: 'title', label: 'по названию', asc: 'title', desc: '-title', defaultGlyph: '▾' },
  { key: 'createdAt', label: 'по новизне', asc: 'createdAt', desc: '-createdAt', defaultGlyph: '▴' },
];

export default function ShowcaseSortBar({ searchParams }: { searchParams: ShowcaseSearchParams }) {
  const current = searchParams.sort || '-createdAt';

  return (
    <div className="admin-showcase-sort">
      <span className="admin-showcase-sort__label">Сортировать</span>
      {OPTIONS.map((opt) => {
        const active = current === opt.asc || current === opt.desc;
        const isDesc = current === opt.desc;
        const glyph = active
          ? (opt.key === 'createdAt' ? (isDesc ? '▴' : '▾') : (isDesc ? '▾' : '▴'))
          : opt.defaultGlyph;
        const nextSort = active ? (isDesc ? opt.asc : opt.desc) : opt.desc;
        return (
          <Link
            key={opt.key}
            href={buildShowcaseHref(searchParams, { sort: nextSort, page: undefined })}
            className={`admin-showcase-sort__btn ${active ? 'admin-showcase-sort__btn--active' : ''}`}
          >
            {opt.label} <span aria-hidden>{glyph}</span>
          </Link>
        );
      })}
    </div>
  );
}
