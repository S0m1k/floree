'use client';

import { useEffect, useRef } from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
}

export default function AnimatedGrid({ children, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.querySelectorAll('.reveal').forEach((node) => node.classList.add('revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const card = entry.target as HTMLElement;
            // Stagger based on sibling index
            const siblings = Array.from(el.children);
            const idx = siblings.indexOf(card);
            card.style.transitionDelay = `${Math.min(idx * 80, 400)}ms`;
            card.classList.add('revealed');
            observer.unobserve(card);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    el.querySelectorAll('.reveal').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
