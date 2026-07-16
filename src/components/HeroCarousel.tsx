'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { SOCIALS } from '@/lib/socials';

const SLIDES = [
  {
    imgDesktop: '/hero/desktop-1.jpg',
    imgMobile: '/hero/mobile-1.jpg',
    alt: 'Авторский букет Floree — цветочная студия Санкт-Петербург',
  },
  {
    imgDesktop: '/hero/desktop-2.jpg',
    imgMobile: '/hero/mobile-2.jpg',
    alt: 'Авторский букет Floree — свежие цветы с доставкой по СПб',
  },
  {
    imgDesktop: '/hero/desktop-3.jpg',
    imgMobile: '/hero/mobile-3.jpg',
    alt: 'Флористическая студия Floree — Полтавский проезд, 2',
  },
  {
    imgDesktop: '/hero/desktop-4.jpg',
    imgMobile: '/hero/mobile-4.jpg',
    alt: 'Букет из свежих цветов — Floree Санкт-Петербург',
  },
  {
    imgDesktop: '/hero/desktop-5.jpg',
    imgMobile: '/hero/mobile-5.jpg',
    alt: 'Авторская флористика Floree — заказ онлайн',
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
      {/* Top action bar: order button (left) + socials (right) */}
      <div className="ed-hero__actions">
        <a href="/catalog" className="btn btn--filled ed-hero__order" data-hover>
          Заказать букет
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor"/></svg>
        </a>
        <div className="ed-hero__socials">
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              className="fl-social"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              data-hover
            >
              {s.icon}
            </a>
          ))}
        </div>
      </div>

      {/* Framed hero photo */}
      <div className="ed-hero__frame">
        <div className="ed-hero__stage">
          {SLIDES.map((s, i) => (
            <div key={i} className={`ed-hero__slide ${i === slide ? 'is-active' : ''}`}>
              <div className="ed-hero__img ed-hero__img--desktop">
                <Image
                  src={s.imgDesktop}
                  alt={s.alt}
                  fill
                  sizes="(max-width: 800px) 100vw, 1600px"
                  priority={i === 0}
                  style={{ objectFit: 'cover' }}
                />
              </div>
              <div className="ed-hero__img ed-hero__img--mobile">
                <Image
                  src={s.imgMobile}
                  alt={s.alt}
                  fill
                  sizes="100vw"
                  priority={i === 0}
                  style={{ objectFit: 'cover' }}
                />
              </div>
            </div>
          ))}
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
      </div>
    </section>
  );
}
