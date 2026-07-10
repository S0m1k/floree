'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import CartDrawer from './CartDrawer';

export default function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const totalItems = useCart((s) => s.totalItems);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const itemCount = mounted ? totalItems() : 0;

  return (
    <>
      <header className={`fl-header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="fl-header__inner">
          <nav className="fl-nav fl-nav--left">
            <Link href="/catalog" data-hover>Каталог</Link>
            <Link href="/#about" data-hover>О нас</Link>
            <Link href="/#reviews" data-hover>Отзывы</Link>
            <Link href="/#contacts" data-hover>Контакты</Link>
          </nav>

          {/* Mobile menu toggle */}
          <button
            className="fl-header__mobile-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Меню"
          >
            {menuOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>

          <Link href="/" className="fl-logo" data-hover aria-label="Floree — на главную">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/floree-logo.svg" alt="Floree" className="fl-logo__img" />
          </Link>

          <nav className="fl-nav fl-nav--right">
            <a href="tel:+79930750577" className="fl-phone" data-hover aria-label="Позвонить: +7 993 075 05 77">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span className="fl-phone__num">+7 (993) 075-05-77</span>
            </a>
            <button className="fl-cart-btn" onClick={() => setDrawerOpen(true)} data-hover>
              Корзина <span className="fl-cart-btn__count">{itemCount}</span>
            </button>
          </nav>

          {/* Mobile: quick call button (right of logo) */}
          <a href="tel:+79930750577" className="fl-header__mobile-call" aria-label="Позвонить">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </a>
        </div>
      </header>

      {/* Mobile menu */}
      <div className={`fl-header__mobile-menu ${menuOpen ? 'is-open' : ''}`}>
        <Link href="/catalog" onClick={() => setMenuOpen(false)}>Каталог</Link>
        <Link href="/#about" onClick={() => setMenuOpen(false)}>О нас</Link>
        <Link href="/#popular" onClick={() => setMenuOpen(false)}>Популярные букеты</Link>
        <Link href="/#reviews" onClick={() => setMenuOpen(false)}>Отзывы</Link>
        <Link href="/shipping" onClick={() => setMenuOpen(false)}>Доставка и оплата</Link>
        <Link href="/#contacts" onClick={() => setMenuOpen(false)}>Контакты</Link>
        <a href="tel:+79930750577" onClick={() => setMenuOpen(false)}>+7 (993) 075-05-77</a>
        <button onClick={() => { setMenuOpen(false); setDrawerOpen(true); }}>
          Корзина ({itemCount})
        </button>
      </div>

      <CartDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
