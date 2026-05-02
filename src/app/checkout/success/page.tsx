import Link from 'next/link';

export const metadata = { title: 'Заказ оплачен — Floree' };

export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-gray-50/30 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center bg-white rounded-3xl p-10 shadow-lg">
        <div className="text-7xl mb-6">🌸</div>
        <h1 className="font-serif text-3xl font-bold text-gray-800 mb-3">Оплата прошла!</h1>
        <p className="text-gray-500 leading-relaxed mb-8">
          Спасибо за заказ! Мы уже готовим ваш букет и свяжемся с вами для подтверждения времени доставки.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-semibold px-8 py-3.5 rounded-2xl transition-colors"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
