'use client';

import { useRef, useState, useEffect, ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  delay?: number;
  kind?: 'up' | 'fade';
  className?: string;
}

export default function Reveal({ children, delay = 0, kind = 'up', className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setShown(true)),
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`fl-reveal fl-reveal--${kind} ${shown ? 'is-in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
