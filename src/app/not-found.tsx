import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50/30 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-8xl mb-6 select-none">🌷</div>
        <h1 className="font-serif text-5xl font-bold text-gray-800 mb-3">404</h1>
        <h2 className="text-xl font-semibold text-gray-600 mb-4">Страница не найдена</h2>
        <p className="text-gray-500 mb-8">
          Кажется, эта страница уже отцвела... Давайте вернёмся к красивым букетам!
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-semibold px-8 py-3.5 rounded-2xl transition-colors shadow-lg shadow-rose-100"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
