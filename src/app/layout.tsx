import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Montserrat } from 'next/font/google';
import './globals.css';
import SiteChrome from '@/components/SiteChrome';

const serif = Cormorant_Garamond({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const sans = Montserrat({
  subsets: ['cyrillic', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Floree — цветочная студия в Санкт-Петербурге',
    template: '%s | Floree',
  },
  description: 'Флористическая студия Floree в Санкт-Петербурге. Авторские букеты с доставкой по СПб. Полтавский проезд, 2.',
  metadataBase: new URL('https://floree.ru'),
  openGraph: {
    siteName: 'Floree',
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@floree_spb',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FlowerShop',
  name: 'Floree',
  description: 'Флористическая студия в Санкт-Петербурге. Авторские букеты с доставкой.',
  url: 'https://floree.ru',
  telephone: '+79930750577',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Полтавский проезд, 2',
    addressLocality: 'Санкт-Петербург',
    addressCountry: 'RU',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 59.9279,
    longitude: 30.3660,
  },
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
    opens: '09:00',
    closes: '21:00',
  },
  priceRange: '₽₽',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${serif.variable} ${sans.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col" style={{ fontFamily: 'var(--font-sans), Montserrat, -apple-system, sans-serif' }}>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
