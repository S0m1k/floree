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
            <Link href="/shipping" data-hover>Доставка</Link>
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

          <Link href="/" className="fl-logo" data-hover>
            <span className="fl-logo__mark">Floree</span>
            <span className="fl-logo__sub">цветочная студия</span>
          </Link>

          <nav className="fl-nav fl-nav--right">
            <Link href="/#about" data-hover>О студии</Link>
            <Link href="/#contacts" data-hover>Контакты</Link>
            <button className="fl-cart-btn" onClick={() => setDrawerOpen(true)} data-hover>
              Корзина <span className="fl-cart-btn__count">{itemCount}</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile menu */}
      <div className={`fl-header__mobile-menu ${menuOpen ? 'is-open' : ''}`}>
        <Link href="/catalog" onClick={() => setMenuOpen(false)}>Каталог</Link>
        <Link href="/shipping" onClick={() => setMenuOpen(false)}>Доставка и оплата</Link>
        <Link href="/#about" onClick={() => setMenuOpen(false)}>О студии</Link>
        <Link href="/#contacts" onClick={() => setMenuOpen(false)}>Контакты</Link>
        <button onClick={() => { setMenuOpen(false); setDrawerOpen(true); }}>
          Корзина ({itemCount})
        </button>
      </div>

      <CartDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
