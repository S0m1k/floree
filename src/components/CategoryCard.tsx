import Image from 'next/image';
import Link from 'next/link';
import { CatalogCategory } from '@/types';

interface Props {
  category: CatalogCategory;
  href: string;
}

const gradients = [
  'from-rose-200 to-pink-300',
  'from-purple-200 to-violet-300',
  'from-orange-200 to-amber-300',
  'from-teal-200 to-cyan-300',
  'from-lime-200 to-green-300',
  'from-sky-200 to-blue-300',
];

function getGradient(id: string) {
  const num = parseInt(id.replace(/\D/g, '') || '0', 10);
  return gradients[num % gradients.length];
}

export default function CategoryCard({ category, href }: Props) {
  const gradient = getGradient(category.id);

  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 aspect-[4/3] block"
    >
      {category.attributes.imageUrl ? (
        <Image
          src={category.attributes.imageUrl}
          alt={category.attributes.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

      {/* Title */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <h3 className="text-white font-semibold text-lg leading-tight group-hover:text-rose-200 transition-colors">
          {category.attributes.title}
        </h3>
        <p className="text-white/70 text-sm mt-1 flex items-center gap-1">
          Смотреть
          <svg className="h-4 w-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </p>
      </div>
    </Link>
  );
}
