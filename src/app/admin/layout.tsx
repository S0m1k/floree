import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Floree Admin',
  robots: { index: false, follow: false },
};

// Root layout for the whole /admin section (login + dashboard). Loads the
// admin-only fonts once so both the login screen and the authenticated shell
// share the same typography.
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- admin-only fonts, loaded once for the whole section */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&family=Roboto:wght@400;500;700&display=swap"
      />
      {children}
    </>
  );
}
