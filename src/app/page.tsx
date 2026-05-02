import Link from 'next/link';
import BouquetCard from '@/components/BouquetCard';
import AnimatedGrid from '@/components/AnimatedGrid';

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
    <div className="bg-[#faf9f7]">

      {/* ── Hero ── */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden px-4">
        {/* Soft radial gradient backdrop */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,#fde8ec_0%,#faf9f7_70%)] pointer-events-none" />

        <div className="relative z-10 text-center max-w-3xl mx-auto">
          {/* Eyebrow */}
          <p className="animate-fadeIn text-xs tracking-[0.3em] uppercase text-rose-500 font-medium mb-8">
            Санкт-Петербург · Цветочный магазин
          </p>

          {/* Decorative line */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="animate-lineGrow origin-right h-px w-16 bg-rose-300" />
            <span className="animate-fadeIn delay-200 text-rose-300 text-lg">✦</span>
            <div className="animate-lineGrow origin-left h-px w-16 bg-rose-300 delay-100" />
          </div>

          {/* Heading */}
          <h1 className="font-serif font-bold text-[clamp(3rem,10vw,6.5rem)] leading-[1.05] text-[#1c1a18] mb-6">
            <span className="animate-fadeInUp block">Floree</span>
            <span className="animate-fadeInUp delay-150 block text-[0.55em] font-normal text-rose-500 tracking-wide">
              цветы с душой
            </span>
          </h1>

          <p className="animate-fadeInUp delay-300 text-gray-500 text-lg max-w-md mx-auto leading-relaxed mb-10">
            Готовые букеты прямо из витрины. Собраны сегодня — доставим за 2 часа.
          </p>

          <div className="animate-fadeInUp delay-400 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="#vitrina"
              className="inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-medium px-8 py-3.5 rounded-full transition-colors duration-200 text-sm tracking-wide"
            >
              Смотреть витрину
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
            <a
              href="#contacts"
              className="inline-flex items-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 font-medium px-8 py-3.5 rounded-full transition-colors duration-200 text-sm tracking-wide bg-white/60 backdrop-blur-sm"
            >
              Как нас найти
            </a>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="animate-fadeIn delay-600 absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-400">
          <span className="text-xs tracking-widest uppercase">Листайте</span>
          <div className="w-px h-8 bg-gradient-to-b from-gray-300 to-transparent" />
        </div>
      </section>

      {/* ── Vitrina ── */}
      <section id="vitrina" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-xs tracking-[0.25em] uppercase text-rose-400 font-medium mb-3">Витрина</p>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold text-[#1c1a18]">
              Сегодня в магазине
            </h2>
          </div>
          <Link
            href="/catalog"
            className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 hover:text-rose-500 transition-colors border-b border-gray-300 hover:border-rose-400 pb-px"
          >
            Все букеты
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {bouquets.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-rose-200 rounded-3xl">
            <p className="text-4xl mb-4">💐</p>
            <p className="text-gray-500 font-medium">Витрина обновляется — загляните позже</p>
            <p className="text-gray-400 text-sm mt-1">Мы готовим свежие букеты</p>
          </div>
        ) : (
          <AnimatedGrid className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {bouquets.map((bouquet: any) => (
              <BouquetCard key={bouquet.id} bouquet={bouquet} />
            ))}
          </AnimatedGrid>
        )}
      </section>

      {/* ── Features strip ── */}
      <section className="border-y border-gray-100 bg-white py-10">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-3 gap-4 text-center">
          {[
            { icon: '🌿', label: 'Свежие цветы', sub: 'Поставка каждый день' },
            { icon: '🚚', label: 'Доставка 2 ч', sub: 'По всему Петербургу' },
            { icon: '🔒', label: 'Оплата онлайн', sub: 'Эквайринг Т-Банка' },
          ].map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-2">
              <span className="text-2xl">{f.icon}</span>
              <span className="text-sm font-semibold text-gray-800">{f.label}</span>
              <span className="text-xs text-gray-400 hidden sm:block">{f.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Contacts + Map ── */}
      <section id="contacts" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="mb-10">
          <p className="text-xs tracking-[0.25em] uppercase text-rose-400 font-medium mb-3">Контакты</p>
          <h2 className="font-serif text-4xl sm:text-5xl font-bold text-[#1c1a18]">Как нас найти</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Contact info */}
          <div className="space-y-6">
            {[
              {
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ),
                label: 'Адрес',
                value: 'Санкт-Петербург, Полтавский проезд, д. 2',
                href: 'https://yandex.ru/maps/?text=Санкт-Петербург+Полтавский+проезд+2',
              },
              {
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                label: 'Режим работы',
                value: 'Пн – Вс: 8:00 – 21:00',
              },
              {
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                ),
                label: 'Телефон',
                value: '+7 (812) 000-00-00',
                href: 'tel:+78120000000',
              },
              {
                icon: (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ),
                label: 'Email',
                value: 'hello@floree.ru',
                href: 'mailto:hello@floree.ru',
              },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center">
                  {item.icon}
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{item.label}</p>
                  {item.href ? (
                    <a href={item.href} className="text-gray-800 font-medium hover:text-rose-500 transition-colors">
                      {item.value}
                    </a>
                  ) : (
                    <p className="text-gray-800 font-medium">{item.value}</p>
                  )}
                </div>
              </div>
            ))}

            <div className="pt-4">
              <Link
                href="/shipping"
                className="inline-flex items-center gap-2 text-sm text-rose-500 hover:text-rose-600 font-medium border-b border-rose-300 hover:border-rose-500 pb-px transition-colors"
              >
                Условия доставки и оплаты
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Yandex Map */}
          <div className="relative overflow-hidden rounded-2xl shadow-md h-80 lg:h-[420px] bg-gray-100">
            <iframe
              src="https://yandex.ru/map-widget/v1/?text=%D0%A1%D0%B0%D0%BD%D0%BA%D1%82-%D0%9F%D0%B5%D1%82%D0%B5%D1%80%D0%B1%D1%83%D1%80%D0%B3%2C+%D0%9F%D0%BE%D0%BB%D1%82%D0%B0%D0%B2%D1%81%D0%BA%D0%B8%D0%B9+%D0%BF%D1%80%D0%BE%D0%B5%D0%B7%D0%B4+2&z=16&l=map"
              width="100%"
              height="100%"
              frameBorder="0"
              allowFullScreen
              title="Floree на карте"
              className="absolute inset-0 w-full h-full"
            />
          </div>
        </div>
      </section>

      {/* ── About ── */}
      <section id="about" className="bg-[#1a3a2a] text-white py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs tracking-[0.3em] uppercase text-green-300 font-medium mb-6">О нас</p>
          <h2 className="font-serif text-4xl sm:text-5xl font-bold mb-6 leading-tight">
            Маленький магазин<br />с большой душой
          </h2>
          <p className="text-green-100 leading-relaxed text-lg mb-4">
            Floree — это цветочный магазин в Санкт-Петербурге, где каждый букет
            собирают вручную с вниманием к деталям.
          </p>
          <p className="text-green-200/70 leading-relaxed">
            Каждый день на витрине появляются свежие букеты — именно их вы
            видите на сайте. Оформите заказ онлайн, и мы доставим цветы в течение двух часов.
          </p>
        </div>
      </section>

    </div>
  );
}
