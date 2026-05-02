import Link from 'next/link';

export const metadata = {
  title: 'Политика конфиденциальности — Floree',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-rose-500 transition-colors mb-10">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          На главную
        </Link>

        <h1 className="font-serif text-4xl font-bold text-gray-800 mb-2">Политика конфиденциальности</h1>
        <p className="text-gray-400 text-sm mb-10">Последнее обновление: 1 мая 2026 г.</p>

        <div className="bg-white rounded-2xl shadow-sm p-8 prose prose-gray max-w-none space-y-8 text-gray-600 leading-relaxed">

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">1. Общие положения</h2>
            <p>Настоящая Политика конфиденциальности (далее — «Политика») определяет порядок обработки персональных данных пользователей сайта <strong>floree.ru</strong>, принадлежащего ИП Сомова А. (далее — «Оператор»).</p>
            <p>Используя сайт, вы выражаете согласие с данной Политикой. Если вы не согласны с её условиями, пожалуйста, прекратите использование сайта.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">2. Какие данные мы собираем</h2>
            <p>При оформлении заказа мы собираем следующие данные:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Имя и фамилия получателя</li>
              <li>Номер телефона</li>
              <li>Адрес доставки</li>
              <li>Дата и время доставки</li>
              <li>Комментарий к заказу</li>
            </ul>
            <p className="mt-3">Также автоматически собираются технические данные: IP-адрес, тип браузера, файлы cookie (подробнее — в <Link href="/cookies" className="text-rose-500 underline">Политике cookie</Link>).</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">3. Цели обработки данных</h2>
            <p>Персональные данные используются исключительно для:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Оформления и выполнения заказов</li>
              <li>Связи с вами по вопросам заказа</li>
              <li>Обработки платежей через систему T-Bank</li>
              <li>Улучшения качества обслуживания</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">4. Передача данных третьим лицам</h2>
            <p>Ваши данные могут передаваться следующим третьим лицам:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>АО «Т-Банк»</strong> — для обработки платежей</li>
              <li><strong>ООО «Посифлора»</strong> — для управления заказами в CRM-системе</li>
            </ul>
            <p className="mt-3">Мы не продаём и не передаём ваши персональные данные иным третьим лицам без вашего согласия, за исключением случаев, предусмотренных законодательством РФ.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">5. Хранение данных</h2>
            <p>Персональные данные хранятся на защищённых серверах в течение срока, необходимого для выполнения целей обработки, но не более 3 лет с момента последнего заказа.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">6. Ваши права</h2>
            <p>В соответствии с Федеральным законом № 152-ФЗ «О персональных данных» вы вправе:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Получить доступ к своим персональным данным</li>
              <li>Потребовать исправления неточных данных</li>
              <li>Потребовать удаления данных</li>
              <li>Отозвать согласие на обработку данных</li>
            </ul>
            <p className="mt-3">Для реализации прав обращайтесь по e-mail: <a href="mailto:hello@floree.ru" className="text-rose-500 underline">hello@floree.ru</a></p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">7. Изменения Политики</h2>
            <p>Оператор вправе вносить изменения в Политику. Актуальная версия всегда доступна на данной странице. Продолжение использования сайта после изменений означает согласие с обновлённой Политикой.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">8. Контакты</h2>
            <p>ИП Сомова А.<br />Адрес: Санкт-Петербург, Полтавский проезд, д. 2<br />E-mail: <a href="mailto:hello@floree.ru" className="text-rose-500 underline">hello@floree.ru</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
