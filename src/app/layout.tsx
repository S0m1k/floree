import type { Metadata } from 'next';
import { Cormorant_Garamond, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const serif = Cormorant_Garamond({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const sans = Inter({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Floree — цветочная студия',
  description: 'Букеты, собранные руками и сердцем. Цветочная студия в Санкт-Петербурге.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen flex flex-col" style={{ fontFamily: 'var(--font-sans), Inter, -apple-system, sans-serif' }}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
