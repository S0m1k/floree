'use client';

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';

interface MaskImageProps {
  src: string;
  alt?: string;
  aspect?: string;
  className?: string;
  delay?: number;
}

export default function MaskImage({ src, alt = '', aspect = '4/5', className = '', delay = 0 }: MaskImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setShown(true)),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`fl-mask ${shown ? 'is-in' : ''} ${className}`}
      style={{ aspectRatio: aspect, transitionDelay: `${delay}ms` }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        style={{ objectFit: 'cover' }}
      />
      <span className="fl-mask__veil" style={{ transitionDelay: `${delay}ms` }} />
    </div>
  );
}
