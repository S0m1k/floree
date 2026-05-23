'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

const SLIDES = [
  {
    img: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=2000&q=80&auto=format&fit=crop',
    alt: 'Букет из пионовидных роз и ранункулюсов — Floree Санкт-Петербург',
    name: 'N° 01 — Rosée',
    caption: 'Пионовидные розы и ранункулюс',
  },
  {
    img: 'https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=2000&q=80&auto=format&fit=crop',
    alt: 'Французские тюльпаны на длинных стеблях — авторский букет Floree',
    name: 'N° 02 — Matin',
    caption: 'Французские тюльпаны на длинных стеблях',
  },
  {
    img: 'https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=2000&q=80&auto=format&fit=crop',
    alt: 'Ветви яблони и кустовая роза — весенний букет Floree СПб',
    name: 'N° 03 — Verger',
    caption: 'Ветви яблони и кустовая роза',
  },
  {
    img: 'https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=2000&q=80&auto=format&fit=crop',
    alt: 'Тёмная флористическая композиция для вечернего события — Floree',
    name: 'N° 04 — Soir',
    caption: 'Тёмная композиция на вечер',
  },
];

export default function HeroCarousel() {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5500);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="ed-hero">
      <div className="ed-hero__stage">
        {SLIDES.map((s, i) => (
          <div key={i} className={`ed-hero__slide ${i === slide ? 'is-active' : ''}`}>
            <Image
              src={s.img}
              alt={s.alt}
              fill
              sizes="100vw"
              priority={i === 0}
              style={{ objectFit: 'cover' }}
            />
          </div>
        ))}
        <div className="ed-hero__veil" />
      </div>

      <div className="ed-hero__copy">
        <div className="eyebrow">Цветочная студия · Санкт-Петербург</div>
        <h1 className="ed-hero__title">
          Букеты,<br />
          <em>собранные руками</em><br />
          и&nbsp;сердцем.
        </h1>
        <div className="ed-hero__meta">
          <div className="ed-hero__counter mono">
            {String(slide + 1).padStart(2, '0')} <span>/</span> {String(SLIDES.length).padStart(2, '0')}
          </div>
          <div className="ed-hero__caption">
            <div className="serif" style={{ fontSize: 22, fontStyle: 'italic' }}>{SLIDES[slide].name}</div>
            <div style={{ color: 'var(--ink-2)', marginTop: 4 }}>{SLIDES[slide].caption}</div>
          </div>
          <a href="/catalog" className="btn btn--filled" data-hover>
            Смотреть каталог
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor"/></svg>
          </a>
        </div>
      </div>

      <div className="ed-hero__dots">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            className={`ed-hero__dot ${i === slide ? 'is-active' : ''}`}
            onClick={() => setSlide(i)}
            data-hover
            aria-label={`Слайд ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
