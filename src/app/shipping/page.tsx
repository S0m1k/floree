import Link from 'next/link';

export const metadata = {
  title: 'Доставка и оплата — Floree',
  description: 'Условия доставки букетов по Санкт-Петербургу и способы оплаты в магазине Floree.',
};

const faqs = [
  {
    id: 'faq1',
    q: 'Сколько стоит доставка?',
    a: 'Уточняйте стоимость доставки при оформлении заказа — цена зависит от района. Свяжитесь с нами по телефону или в мессенджере, и мы рассчитаем стоимость.',
  },
  {
    id: 'faq2',
    q: 'Можно ли заказать доставку к точному времени?',
    a: 'Да, при оформлении заказа укажите желаемое время доставки. Мы постараемся доставить букет точно к указанному времени. При заказе менее чем за 2 часа время согласовывается дополнительно.',
  },
  {
    id: 'faq3',
    q: 'Как оплатить заказ?',
    a: 'Оплата производится онлайн картой (Visa, Mastercard, МИР) через защищённый эквайринг Т-Банка. После оформления вы будете перенаправлены на страницу оплаты.',
  },
  {
    id: 'faq4',
    q: 'Что если букет не понравится?',
    a: 'Мы уверены в качестве наших цветов. Если у вас есть претензии к букету, свяжитесь с нами в течение 24 часов после получения с фотографией — мы обязательно решим вопрос.',
  },
];

export default function ShippingPage() {
  return (
    <div className="min-h-screen bg-[#faf9f7]">

      {/* Page header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
            <Link href="/" className="hover:text-rose-500 transition-colors">Главная</Link>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-600 font-medium">Доставка и оплата</span>
          </nav>
          <p className="text-xs tracking-[0.25em] uppercase text-rose-400 font-medium mb-3">Информация</p>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-[#1c1a18]">
            Доставка и оплата
          </h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-14">

        {/* ── Доставка ── */}
        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
            </div>
            <h2 className="font-serif text-2xl font-bold text-[#1c1a18]">Доставка</h2>
          </div>

          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { value: '2 часа', label: 'Срок доставки' },
                { value: 'СПб', label: 'Зона доставки' },
                { value: '8:00–21:00', label: 'Часы доставки' },
              ].map((stat) => (
                <div key={stat.label} className="text-center p-4 bg-rose-50 rounded-xl">
                  <p className="font-serif text-2xl font-bold text-rose-500 mb-1">{stat.value}</p>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="pt-2 space-y-3 text-gray-600 text-sm leading-relaxed">
              <p>
                Доставляем по всему Санкт-Петербургу. Срок доставки — <strong className="text-gray-800">в течение 2 часов</strong> после подтверждения заказа (в рабочее время магазина).
              </p>
              <p>
                Стоимость доставки рассчитывается индивидуально в зависимости от района — уточняйте при оформлении. Позвоните нам или напишите, и мы рассчитаем стоимость.
              </p>
              <p>
                При оформлении заказа вы можете указать желаемые дату и время доставки. Наш курьер свяжется с вами заранее.
              </p>
            </div>
          </div>
        </section>

        {/* ── Самовывоз ── */}
        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-green-50 text-green-700 flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="font-serif text-2xl font-bold text-[#1c1a18]">Самовывоз</h2>
          </div>

          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="flex-1 space-y-3 text-gray-600 text-sm leading-relaxed">
                <p>
                  Вы можете забрать заказ самостоятельно из нашего магазина — это <strong className="text-gray-800">бесплатно</strong>.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-800 font-medium">
                    <svg className="h-4 w-4 text-rose-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    Полтавский проезд, д. 2, Санкт-Петербург
                  </div>
                  <div className="flex items-center gap-2 text-gray-800 font-medium">
                    <svg className="h-4 w-4 text-rose-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Пн – Вс: 8:00 – 21:00
                  </div>
                </div>
                <p className="text-gray-400 text-xs">
                  При самовывозе оплата также происходит онлайн при оформлении заказа.
                </p>
              </div>
              <a
                href="https://yandex.ru/maps/?text=Санкт-Петербург+Полтавский+проезд+2"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center gap-2 text-sm text-rose-500 hover:text-rose-600 font-medium border border-rose-200 hover:border-rose-400 px-4 py-2.5 rounded-xl transition-colors"
              >
                Открыть на карте
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </section>

        {/* ── Оплата ── */}
        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <h2 className="font-serif text-2xl font-bold text-[#1c1a18]">Оплата</h2>
          </div>

          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
            <p className="text-gray-600 text-sm leading-relaxed">
              Оплата заказов производится <strong className="text-gray-800">онлайн</strong> банковской картой через защищённый платёжный шлюз <strong className="text-gray-800">АО «Т-Банк»</strong>. Данные карты не хранятся на нашем сайте.
            </p>

            <div className="flex flex-wrap gap-3">
              {['Visa', 'Mastercard', 'МИР', 'SberPay'].map((card) => (
                <span
                  key={card}
                  className="px-4 py-2 bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg"
                >
                  {card}
                </span>
              ))}
            </div>

            <div className="flex items-start gap-3 bg-green-50 rounded-xl p-4 text-sm text-green-800">
              <svg className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Соединение защищено шифрованием TLS. Платёж проходит через сертифицированный шлюз Т-Банка по стандарту PCI DSS.</span>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section>
          <div className="mb-6">
            <p className="text-xs tracking-[0.25em] uppercase text-rose-400 font-medium mb-3">FAQ</p>
            <h2 className="font-serif text-2xl font-bold text-[#1c1a18]">Частые вопросы</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <div key={faq.id} className="faq-item bg-white rounded-2xl shadow-sm overflow-hidden">
                <input type="checkbox" id={faq.id} />
                <label
                  htmlFor={faq.id}
                  className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer select-none"
                >
                  <span className="font-medium text-gray-800 text-sm sm:text-base">{faq.q}</span>
                  <span className="faq-icon flex-shrink-0 w-7 h-7 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-lg font-light">
                    +
                  </span>
                </label>
                <div className="faq-content">
                  <p className="px-6 pb-5 text-gray-500 text-sm leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center py-6">
          <p className="text-gray-500 mb-6 text-sm">Есть вопросы? Мы ответим!</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="tel:+78120000000"
              className="inline-flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-medium px-8 py-3.5 rounded-full transition-colors text-sm"
            >
              Позвонить
            </a>
            <Link
              href="/catalog"
              className="inline-flex items-center justify-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 font-medium px-8 py-3.5 rounded-full transition-colors text-sm"
            >
              Перейти на витрину
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
