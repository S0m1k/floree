'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';

interface Props {
  images: string[];
  title: string;
}

// Swipeable product gallery: arrows + dots + thumbnails, no external deps.
export default function RecipeGallery({ images, title }: Props) {
  const [active, setActive] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (images.length === 0) {
    return (
      <div className="relative aspect-square overflow-hidden" style={{ background: 'var(--bone)' }} />
    );
  }

  const prev = () => setActive((a) => (a - 1 + images.length) % images.length);
  const next = () => setActive((a) => (a + 1) % images.length);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return; // tap, not a swipe
    if (dx < 0) next();
    else prev();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        className="relative aspect-square overflow-hidden fl-gallery"
        style={{ background: 'var(--bone)' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {images.map((src, i) => (
          <div key={i} className={`fl-gallery__slide ${i === active ? 'is-active' : ''}`}>
            <Image
              src={src}
              alt={`${title} — фото ${i + 1}`}
              fill
              unoptimized
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority={i === 0}
            />
          </div>
        ))}

        {images.length > 1 && (
          <>
            <button className="fl-gallery__arrow fl-gallery__arrow--prev" onClick={prev} aria-label="Предыдущее фото" data-hover>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button className="fl-gallery__arrow fl-gallery__arrow--next" onClick={next} aria-label="Следующее фото" data-hover>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <div className="fl-gallery__dots">
              {images.map((_, i) => (
                <button
                  key={i}
                  className={`fl-gallery__dot ${i === active ? 'is-active' : ''}`}
                  onClick={() => setActive(i)}
                  aria-label={`Фото ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(images.length, 5)}, 1fr)`, gap: 8 }}>
          {images.slice(0, 5).map((src, i) => (
            <button
              key={i}
              className={`relative aspect-square overflow-hidden fl-gallery__thumb ${i === active ? 'is-active' : ''}`}
              style={{ background: 'var(--bone)', border: 0, padding: 0, cursor: 'pointer' }}
              onClick={() => setActive(i)}
              aria-label={`Показать фото ${i + 1}`}
            >
              <Image src={src} alt={`${title} — миниатюра ${i + 1}`} fill unoptimized className="object-cover" sizes="20vw" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
