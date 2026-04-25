'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import CartDrawer from './CartDrawer';

export default function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const totalItems = useCart((s) => s.totalItems);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const itemCount = totalItems();

  return (
    <>
      <header
        className={`sticky top-0 z-40 w-full bg-white transition-shadow duration-300 ${
          scrolled ? 'shadow-md' : 'shadow-sm'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              href="/"
              className="font-serif text-2xl font-bold text-rose-600 tracking-wide hover:text-rose-700 transition-colors"
            >
              Floree
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              <Link
                href="/catalog"
                className="text-gray-700 hover:text-rose-600 font-medium transition-colors text-sm tracking-wide uppercase"
              >
                Витрина
              </Link>
              <Link
                href="/#about"
                className="text-gray-700 hover:text-rose-600 font-medium transition-colors text-sm tracking-wide uppercase"
              >
                О нас
              </Link>
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-4">
              {/* Cart button */}
              <button
                onClick={() => setDrawerOpen(true)}
                className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-rose-50 transition-colors"
                aria-label="Корзина"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-gray-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {itemCount > 99 ? '99+' : itemCount}
                  </span>
                )}
              </button>

              {/* Mobile menu button */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Меню"
              >
                {menuOpen ? (
                  <svg className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {menuOpen && (
            <div className="md:hidden border-t border-gray-100 py-3 pb-4">
              <nav className="flex flex-col gap-1">
                <Link
                  href="/catalog"
                  onClick={() => setMenuOpen(false)}
                  className="px-4 py-2.5 text-gray-700 hover:text-rose-600 hover:bg-rose-50 rounded-lg font-medium transition-colors"
                >
                  Витрина
                </Link>
                <Link
                  href="/#about"
                  onClick={() => setMenuOpen(false)}
                  className="px-4 py-2.5 text-gray-700 hover:text-rose-600 hover:bg-rose-50 rounded-lg font-medium transition-colors"
                >
                  О нас
                </Link>
              </nav>
            </div>
          )}
        </div>
      </header>

      <CartDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
