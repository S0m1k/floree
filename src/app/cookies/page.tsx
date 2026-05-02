import Link from 'next/link';

export const metadata = {
  title: 'Политика cookie — Floree',
};

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-gray-50/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-rose-500 transition-colors mb-10">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          На главную
        </Link>

        <h1 className="font-serif text-4xl font-bold text-gray-800 mb-2">Политика cookie</h1>
        <p className="text-gray-400 text-sm mb-10">Последнее обновление: 1 мая 2026 г.</p>

        <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 text-gray-600 leading-relaxed">

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">Что такое cookie?</h2>
            <p>Cookie — небольшие текстовые файлы, которые сохраняются в вашем браузере при посещении сайта. Они позволяют сайту «запоминать» вас и ваши предпочтения.</p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">Какие cookie мы используем</h2>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-3 border border-gray-100 font-semibold text-gray-700">Название</th>
                    <th className="text-left p-3 border border-gray-100 font-semibold text-gray-700">Тип</th>
                    <th className="text-left p-3 border border-gray-100 font-semibold text-gray-700">Цель</th>
                    <th className="text-left p-3 border border-gray-100 font-semibold text-gray-700">Срок</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 border border-gray-100 font-mono text-xs">floree-cart</td>
                    <td className="p-3 border border-gray-100">Функциональный</td>
                    <td className="p-3 border border-gray-100">Хранение содержимого корзины (localStorage)</td>
                    <td className="p-3 border border-gray-100">До очистки браузера</td>
                  </tr>
                  <tr className="bg-gray-50/50">
                    <td className="p-3 border border-gray-100 font-mono text-xs">_session</td>
                    <td className="p-3 border border-gray-100">Необходимый</td>
                    <td className="p-3 border border-gray-100">Сессия пользователя</td>
                    <td className="p-3 border border-gray-100">Сессия</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">Управление cookie</h2>
            <p>Вы можете отключить cookie в настройках браузера. Обратите внимание: отключение функциональных cookie может повлиять на работу корзины и других функций сайта.</p>
            <p className="mt-3">Инструкции для популярных браузеров:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Chrome: Настройки → Конфиденциальность и безопасность → Файлы cookie</li>
              <li>Firefox: Настройки → Приватность и защита → Куки</li>
              <li>Safari: Настройки → Конфиденциальность → Файлы cookie</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-gray-800 mb-3">Контакты</h2>
            <p>По вопросам использования cookie: <a href="mailto:hello@floree.ru" className="text-rose-500 underline">hello@floree.ru</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
