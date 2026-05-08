'use client';

import { useRef, useEffect } from 'react';

export default function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const state = useRef({ x: 0, y: 0, tx: 0, ty: 0, big: false, raf: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      state.current.tx = e.clientX;
      state.current.ty = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }
    };

    const tick = () => {
      const s = state.current;
      s.x += (s.tx - s.x) * 0.18;
      s.y += (s.ty - s.y) * 0.18;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) scale(${s.big ? 2.4 : 1})`;
      }
      s.raf = requestAnimationFrame(tick);
    };

    const onEnter = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.('[data-hover]')) {
        state.current.big = true;
        ringRef.current?.classList.add('is-big');
      }
    };
    const onLeave = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.('[data-hover]')) {
        state.current.big = false;
        ringRef.current?.classList.remove('is-big');
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onEnter);
    document.addEventListener('mouseout', onLeave);
    state.current.raf = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onEnter);
      document.removeEventListener('mouseout', onLeave);
      cancelAnimationFrame(state.current.raf);
    };
  }, []);

  return (
    <div className="fl-cursor" aria-hidden="true">
      <div ref={ringRef} className="fl-cursor__ring" />
      <div ref={dotRef} className="fl-cursor__dot" />
    </div>
  );
}
