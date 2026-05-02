import Link from 'next/link';

export const metadata = { title: 'Оплата не прошла — Floree' };

export default function FailPage() {
  return (
    <div className="min-h-screen bg-gray-50/30 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center bg-white rounded-3xl p-10 shadow-lg">
        <div className="text-7xl mb-6">😔</div>
        <h1 className="font-serif text-3xl font-bold text-gray-800 mb-3">Оплата не прошла</h1>
        <p className="text-gray-500 leading-relaxed mb-8">
          Не переживайте — ваш заказ сохранён. Попробуйте оплатить ещё раз или свяжитесь с нами.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/checkout"
            className="inline-flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 py-3.5 rounded-2xl transition-colors"
          >
            Попробовать снова
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold px-6 py-3.5 rounded-2xl transition-colors"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
