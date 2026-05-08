import Link from 'next/link';
import BouquetCard from '@/components/BouquetCard';

const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const metadata = {
  title: 'Витрина — Floree',
  description: 'Готовые букеты прямо из витрины Floree. Быстрая доставка по Санкт-Петербургу.',
};

async function getBouquets() {
  try {
    const res = await fetch(`${API_URL}/api/bouquets`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export default async function CatalogPage() {
  const bouquets = await getBouquets();

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <div style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="eyebrow mb-4">Витрина</p>
          <h1 className="serif" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', color: 'var(--ink)', lineHeight: 1.1 }}>
            Готовые букеты
          </h1>
          <p className="mt-3" style={{ color: 'var(--ink-3)', fontSize: '1rem' }}>
            Букеты, которые ждут вас прямо сейчас
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {bouquets.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl font-medium mb-2" style={{ color: 'var(--ink-2)' }}>
              Витрина обновляется — загляните позже
            </p>
            <p className="text-sm mb-8" style={{ color: 'var(--ink-3)' }}>
              Мы готовим для вас свежие букеты
            </p>
            <Link href="/" className="btn btn--filled">
              На главную
            </Link>
          </div>
        ) : (
          <>
            <p className="eyebrow mb-8">
              {bouquets.length} {bouquets.length === 1 ? 'букет' : bouquets.length < 5 ? 'букета' : 'букетов'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {bouquets.map((bouquet: any) => (
                <BouquetCard key={bouquet.id} bouquet={bouquet} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
