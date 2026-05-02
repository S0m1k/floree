import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-green-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h2 className="font-serif text-3xl font-bold text-white mb-2">Floree</h2>
            <p className="text-green-200 text-sm leading-relaxed">
              Цветы с душой. Мы создаём букеты, которые говорят больше, чем слова.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-green-300 mb-4">
              Навигация
            </h3>
            <nav className="flex flex-col gap-2">
              <Link href="/catalog" className="text-green-100 hover:text-white transition-colors text-sm">Витрина</Link>
              <Link href="/#about" className="text-green-100 hover:text-white transition-colors text-sm">О нас</Link>
              <Link href="/checkout" className="text-green-100 hover:text-white transition-colors text-sm">Оформить заказ</Link>
              <Link href="/offer" className="text-green-100 hover:text-white transition-colors text-sm">Публичная оферта</Link>
              <Link href="/privacy" className="text-green-100 hover:text-white transition-colors text-sm">Конфиденциальность</Link>
              <Link href="/cookies" className="text-green-100 hover:text-white transition-colors text-sm">Политика cookie</Link>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-green-300 mb-4">
              Контакты
            </h3>
            <div className="flex flex-col gap-2 text-sm text-green-100">
              <a
                href="tel:+79990000000"
                className="hover:text-white transition-colors flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                +7 (999) 000-00-00
              </a>
              <p className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Пн–Вс: 8:00 – 21:00
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-green-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-green-300 text-sm">
            © {new Date().getFullYear()} Floree. Все права защищены.
          </p>
          <p className="text-green-400 text-xs">
            Свежие цветы · Быстрая доставка · Лучшие букеты
          </p>
        </div>
      </div>
    </footer>
  );
}
