import Link from 'next/link';

export const metadata = {
  title: 'Публичная оферта — Floree',
};

export default function OfferPage() {
  return (
    <div className="min-h-screen bg-gray-50/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-rose-500 transition-colors mb-10">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          На главную
        </Link>

        <h1 className="font-serif text-4xl font-bold text-gray-800 mb-2">Публичная оферта</h1>
        <p className="text-gray-400 text-sm mb-10">Последнее обновление: 1 мая 2026 г.</p>

        <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 text-gray-600 leading-relaxed">

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">1. Общие положения</h2>
            <p>Настоящий документ является публичной офертой ИП Сомовой А. (далее — «Продавец») и содержит условия заключения договора купли-продажи товаров (цветочных композиций, букетов) с доставкой через сайт <strong>floree.ru</strong>.</p>
            <p className="mt-3">Оформление заказа на сайте означает полное и безоговорочное принятие (акцепт) условий настоящей оферты в соответствии со ст. 438 ГК РФ.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">2. Предмет договора</h2>
            <p>Продавец обязуется передать Покупателю заказанные цветочные композиции (букеты) надлежащего качества, а Покупатель обязуется оплатить и принять товар на условиях настоящей оферты.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">3. Оформление заказа</h2>
            <p>Заказ оформляется на сайте через форму оформления. При оформлении Покупатель указывает:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Имя получателя</li>
              <li>Номер телефона</li>
              <li>Адрес доставки</li>
              <li>Желаемые дату и время доставки</li>
            </ul>
            <p className="mt-3">Заказ считается принятым после подтверждения оплаты.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">4. Цены и оплата</h2>
            <p>Цены на товары указаны в рублях РФ и включают НДС (при наличии). Оплата производится онлайн через платёжную систему АО «Т-Банк» до передачи товара.</p>
            <p className="mt-3">Продавец вправе изменять цены на товары. Изменение цены не распространяется на уже оплаченные заказы.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">5. Доставка</h2>
            <p>Доставка осуществляется по Санкт-Петербургу. Срок доставки — в течение 2 часов после подтверждения оплаты (в рабочее время магазина).</p>
            <p className="mt-3">Продавец свяжется с Покупателем по телефону для уточнения деталей доставки. В случае невозможности дозвониться в течение 30 минут заказ может быть отменён с полным возвратом средств.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">6. Качество товара</h2>
            <p>Все цветы и композиции изготавливаются из свежих материалов. Ввиду природного характера товара незначительные отличия от фотографий на сайте допустимы и не являются нарушением условий договора.</p>
            <p className="mt-3">При обнаружении существенных недостатков товара Покупатель вправе предъявить претензию в течение 24 часов с момента получения, направив фотографии на e-mail <a href="mailto:hello@floree.ru" className="text-rose-500 underline">hello@floree.ru</a>.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">7. Возврат и отмена</h2>
            <p>Ввиду скоропортящейся природы товара (цветы), возврат товара надлежащего качества не производится в соответствии с Постановлением Правительства РФ № 2463 от 31.12.2020.</p>
            <p className="mt-3">Отмена заказа возможна до момента передачи заказа в доставку. Для отмены свяжитесь с нами по телефону или e-mail.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">8. Ответственность сторон</h2>
            <p>Продавец не несёт ответственности за задержку доставки, вызванную обстоятельствами непреодолимой силы, а также за действия третьих лиц.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">9. Персональные данные</h2>
            <p>Обработка персональных данных осуществляется в соответствии с <Link href="/privacy" className="text-rose-500 underline">Политикой конфиденциальности</Link>. Оформляя заказ, Покупатель даёт согласие на обработку персональных данных.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">10. Реквизиты Продавца</h2>
            <p>
              ИП Сомова А.<br />
              Адрес: Санкт-Петербург, Полтавский проезд, д. 2<br />
              E-mail: <a href="mailto:hello@floree.ru" className="text-rose-500 underline">hello@floree.ru</a><br />
              Сайт: floree.ru
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
