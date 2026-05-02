import Link from 'next/link';
import BouquetCard from '@/components/BouquetCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function getBouquets() {
  try {
    const res = await fetch(`${API_URL}/bouquets`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const bouquets = await getBouquets();

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-rose-50 via-pink-50 to-amber-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 flex flex-col items-center text-center">
          <span className="inline-block bg-rose-100 text-rose-600 text-sm font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wide">
            Свежие букеты · Санкт-Петербург
          </span>
          <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-800 mb-6 leading-tight">
            Floree —<br />
            <span className="text-rose-500">цветы с душой</span>
          </h1>
          <p className="text-gray-500 text-lg sm:text-xl max-w-xl mb-10 leading-relaxed">
            Готовые букеты прямо из витрины. Собраны с любовью, доставим за 2 часа.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="#vitrina"
              className="inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-semibold px-8 py-4 rounded-2xl transition-colors shadow-lg shadow-rose-200 text-base"
            >
              Смотреть витрину
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Link>
            <Link
              href="/#about"
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-8 py-4 rounded-2xl transition-colors border border-gray-200 text-base"
            >
              О нас
            </Link>
          </div>
        </div>
      </section>

      {/* Vitrina */}
      <section id="vitrina" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-800 mb-2">
              Наша витрина
            </h2>
            <p className="text-gray-500">Букеты, которые ждут вас прямо сейчас</p>
          </div>
          <Link href="/catalog" className="hidden sm:flex items-center gap-1 text-rose-500 hover:text-rose-600 font-medium transition-colors text-sm">
            Все букеты
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {bouquets.length === 0 ? (
          <div className="text-center py-20 bg-rose-50/50 rounded-3xl">
            <div className="text-7xl mb-4">💐</div>
            <p className="text-gray-500 text-lg font-medium">Витрина обновляется — загляните позже!</p>
            <p className="text-gray-400 text-sm mt-2">Мы готовим для вас свежие букеты</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {bouquets.map((bouquet: any) => (
              <BouquetCard key={bouquet.id} bouquet={bouquet} />
            ))}
          </div>
        )}
      </section>

      {/* Features */}
      <section className="bg-white border-y border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { icon: '🌸', title: 'Свежие цветы', desc: 'Только сегодняшняя поставка' },
              { icon: '🚚', title: 'Доставка за 2 часа', desc: 'По всему Санкт-Петербургу' },
              { icon: '💳', title: 'Онлайн-оплата', desc: 'Безопасный эквайринг Т-Банка' },
            ].map((f) => (
              <div key={f.title} className="flex flex-col items-center gap-3">
                <span className="text-4xl">{f.icon}</span>
                <h3 className="font-semibold text-gray-800">{f.title}</h3>
                <p className="text-gray-400 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-800 mb-6">О нас</h2>
          <p className="text-gray-500 leading-relaxed text-lg mb-4">
            Floree — это небольшой цветочный магазин в Санкт-Петербурге на Полтавском проезде, дом 2.
            Мы собираем букеты с любовью и вниманием к каждой детали.
          </p>
          <p className="text-gray-400 leading-relaxed">
            Каждый день на нашей витрине появляются свежие букеты — именно их вы видите на этом сайте.
            Оформите заказ онлайн, и мы доставим цветы в течение 2 часов.
          </p>
        </div>
      </section>
    </div>
  );
}
