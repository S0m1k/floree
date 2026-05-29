'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

const SLIDES = [
  {
    img: '/hero-1.jpg',
    alt: 'Высокая композиция из пионов Coral Charm, голубого дельфиниума и эвкалипта — Floree Санкт-Петербург',
    name: 'N° 01 — Azur',
    caption: 'Пионы Coral Charm и голубой дельфиниум',
  },
  {
    img: '/hero-2.jpg',
    alt: 'Авторский букет из коралловых пионов, зелёной гвоздики и молюцеллы — Floree СПб',
    name: 'N° 02 — Verde',
    caption: 'Коралловые пионы, гвоздика и молюцелла',
  },
];

export default function HeroCarousel() {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 8000);
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
