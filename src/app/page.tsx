import Link from 'next/link';
import { posifloraFetch } from '@/lib/posiflora';
import CategoryCard from '@/components/CategoryCard';
import { CatalogCategory } from '@/types';

async function getCategories(): Promise<CatalogCategory[]> {
  try {
    const data = await posifloraFetch('/v1/catalog/categories');
    return data?.data ?? [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const categories = await getCategories();
  const featured = categories.slice(0, 6);

  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden min-h-[85vh] flex items-center">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-pink-50 to-amber-50" />
        {/* Decorative blobs */}
        <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-rose-200/40 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-pink-200/30 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/4 w-48 h-48 bg-amber-200/30 rounded-full blur-2xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
          <div className="max-w-2xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm text-rose-600 text-sm font-medium px-4 py-2 rounded-full shadow-sm mb-8 border border-rose-100">
              <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
              Свежие цветы каждый день
            </div>

            <h1 className="font-serif text-6xl sm:text-7xl lg:text-8xl font-bold text-gray-800 leading-[1.05] mb-6">
              Floree
            </h1>
            <p className="text-xl sm:text-2xl text-gray-600 leading-relaxed mb-4 font-light">
              Свежие цветы с доставкой
            </p>
            <p className="text-gray-500 text-lg leading-relaxed mb-10 max-w-lg">
              Создаём букеты, которые дарят радость и выражают самые тёплые чувства. Доставим в любую точку города.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                href="/catalog"
                className="inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-semibold px-8 py-4 rounded-2xl shadow-lg shadow-rose-200 transition-all duration-200 hover:-translate-y-0.5 text-base"
              >
                Смотреть каталог
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/#about"
                className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm hover:bg-white text-gray-700 font-semibold px-8 py-4 rounded-2xl border border-gray-200 shadow-sm transition-all duration-200 hover:-translate-y-0.5 text-base"
              >
                О нас
              </Link>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-8 mt-14 pt-10 border-t border-rose-100/60">
              {[
                { num: '500+', label: 'видов цветов' },
                { num: '1000+', label: 'счастливых клиентов' },
                { num: '2 часа', label: 'доставка по городу' },
              ].map(({ num, label }) => (
                <div key={label}>
                  <div className="text-2xl font-bold text-rose-600 font-serif">{num}</div>
                  <div className="text-gray-500 text-sm mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Decorative flower icons */}
        <div className="hidden lg:block absolute right-16 top-1/2 -translate-y-1/2 text-rose-200 select-none pointer-events-none">
          <div className="text-[180px] leading-none opacity-40">🌹</div>
        </div>
      </section>

      {/* Categories Section */}
      {featured.length > 0 && (
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="font-serif text-4xl font-bold text-gray-800 mb-3">
                Наши коллекции
              </h2>
              <p className="text-gray-500 text-lg max-w-lg mx-auto">
                Найдите идеальный букет для любого момента
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((category) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  href={`/catalog/${category.attributes.slug}`}
                />
              ))}
            </div>

            <div className="text-center mt-10">
              <Link
                href="/catalog"
                className="inline-flex items-center gap-2 text-rose-600 hover:text-rose-700 font-semibold text-base border-b-2 border-rose-200 hover:border-rose-500 pb-0.5 transition-all"
              >
                Весь каталог
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-16 bg-rose-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                icon: '🚚',
                title: 'Быстрая доставка',
                desc: 'Доставляем в течение 2 часов по всему городу',
              },
              {
                icon: '🌿',
                title: 'Свежие цветы',
                desc: 'Только что срезанные цветы от лучших поставщиков',
              },
              {
                icon: '💐',
                title: 'Ручная работа',
                desc: 'Каждый букет собирается вручную с любовью',
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="bg-white rounded-2xl p-7 text-center shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-5xl mb-4">{icon}</div>
                <h3 className="font-semibold text-gray-800 text-lg mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block text-sm font-medium text-rose-600 uppercase tracking-widest mb-4">
                О нас
              </div>
              <h2 className="font-serif text-4xl lg:text-5xl font-bold text-gray-800 mb-6 leading-tight">
                Мы создаём красоту,<br />
                <span className="text-rose-500">которая говорит</span>
              </h2>
              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>
                  Floree — это цветочная мастерская, где каждый букет создаётся с особой заботой и вниманием к деталям. Мы верим, что цветы — это язык, способный передать то, что сложно выразить словами.
                </p>
                <p>
                  Работаем только с лучшими поставщиками, чтобы вы получали только свежие и красивые цветы. Наши флористы с радостью помогут выбрать идеальный букет для любого случая: юбилея, свадьбы, признания в любви или просто так.
                </p>
                <p>
                  Каждый заказ — это маленький шедевр, созданный специально для вас.
                </p>
              </div>

              <div className="mt-8">
                <Link
                  href="/catalog"
                  className="inline-flex items-center gap-2 bg-green-800 hover:bg-green-700 text-white font-semibold px-7 py-3.5 rounded-xl shadow-sm transition-colors"
                >
                  Выбрать букет
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-rose-100 to-pink-200 rounded-2xl aspect-[3/4] flex items-center justify-center">
                    <span className="text-7xl">🌹</span>
                  </div>
                  <div className="bg-gradient-to-br from-purple-100 to-violet-200 rounded-2xl aspect-square flex items-center justify-center">
                    <span className="text-6xl">💐</span>
                  </div>
                </div>
                <div className="space-y-4 mt-8">
                  <div className="bg-gradient-to-br from-amber-100 to-orange-200 rounded-2xl aspect-square flex items-center justify-center">
                    <span className="text-6xl">🌻</span>
                  </div>
                  <div className="bg-gradient-to-br from-teal-100 to-cyan-200 rounded-2xl aspect-[3/4] flex items-center justify-center">
                    <span className="text-7xl">🌸</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-gradient-to-r from-rose-500 to-pink-600 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-white mb-4">
            Подарите радость прямо сейчас
          </h2>
          <p className="text-rose-100 text-lg mb-8 max-w-xl mx-auto">
            Выберите букет из нашего каталога и мы доставим его в течение 2 часов
          </p>
          <Link
            href="/catalog"
            className="inline-flex items-center gap-2 bg-white text-rose-600 font-bold px-8 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 text-base"
          >
            Смотреть каталог
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>
    </>
  );
}
