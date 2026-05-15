'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

const SLIDES = [
  {
    img: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=2000&q=80&auto=format&fit=crop',
    name: 'N\u00b0 01 \u2014 Ros\u00e9e',
    caption: '\u041f\u0438\u043e\u043d\u043e\u0432\u0438\u0434\u043d\u044b\u0435 \u0440\u043e\u0437\u044b \u0438 \u0440\u0430\u043d\u0443\u043d\u043a\u0443\u043b\u044e\u0441',
  },
  {
    img: 'https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=2000&q=80&auto=format&fit=crop',
    name: 'N\u00b0 02 \u2014 Matin',
    caption: '\u0424\u0440\u0430\u043d\u0446\u0443\u0437\u0441\u043a\u0438\u0435 \u0442\u044e\u043b\u044c\u043f\u0430\u043d\u044b \u043d\u0430 \u0434\u043b\u0438\u043d\u043d\u044b\u0445 \u0441\u0442\u0435\u0431\u043b\u044f\u0445',
  },
  {
    img: 'https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=2000&q=80&auto=format&fit=crop',
    name: 'N\u00b0 03 \u2014 Verger',
    caption: '\u0412\u0435\u0442\u0432\u0438 \u044f\u0431\u043b\u043e\u043d\u0438 \u0438 \u043a\u0443\u0441\u0442\u043e\u0432\u0430\u044f \u0440\u043e\u0437\u0430',
  },
  {
    img: 'https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=2000&q=80&auto=format&fit=crop',
    name: 'N\u00b0 04 \u2014 Soir',
    caption: '\u0422\u0451\u043c\u043d\u0430\u044f \u043a\u043e\u043c\u043f\u043e\u0437\u0438\u0446\u0438\u044f \u043d\u0430 \u0432\u0435\u0447\u0435\u0440',
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
              alt={s.name}
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
