import type { ReactNode } from 'react';

export interface Social {
  label: string;
  href: string;
  icon: ReactNode;
}

/** Social channels shown in the hero action bar and footer. */
export const SOCIALS: Social[] = [
  {
    label: 'ВКонтакте',
    href: 'https://vk.com/club230325649',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13.16 17.24c-5.48 0-8.9-3.86-9.04-10.26h2.77c.1 4.7 2.25 6.7 3.9 7.11V6.98h2.65v3.9c1.6-.17 3.28-2.03 3.85-3.9h2.6c-.44 2.28-2.24 4.14-3.52 4.9 1.28.62 3.33 2.24 4.12 5.26h-2.86c-.6-1.92-2.13-3.4-4.19-3.6v3.6h-.33z"/>
      </svg>
    ),
  },
  {
    label: 'Telegram',
    href: 'https://t.me/floree_flowers',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21.94 4.6l-3.32 15.66c-.25 1.1-.9 1.37-1.83.85l-5.05-3.72-2.44 2.35c-.27.27-.5.5-1.02.5l.36-5.14 9.36-8.46c.4-.36-.09-.56-.63-.2L5.14 13.02.15 11.46c-1.08-.34-1.1-1.08.23-1.6L20.54 3.02c.9-.34 1.69.2 1.4 1.58z"/>
      </svg>
    ),
  },
  {
    label: 'MAX',
    href: 'https://max.ru/u/f9LHodD0cOK58WsS23L3Y7IwWzIEZuGewhaImvD6hNZzrqw7SoG18SVUmgc',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 20V4h3.4L12 12.6 17.6 4H21v16h-3.2V9.6L12.9 17h-1.8L6.2 9.6V20H3z"/>
      </svg>
    ),
  },
];
