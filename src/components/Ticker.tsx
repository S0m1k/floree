'use client';

interface TickerProps {
  items: string[];
  speed?: number;
}

export default function Ticker({ items, speed = 50 }: TickerProps) {
  const list = [...items, ...items];
  return (
    <div className="fl-ticker">
      <div className="fl-ticker__track" style={{ animationDuration: `${speed}s` }}>
        {list.map((item, i) => (
          <span key={i} className="fl-ticker__item">
            <span className="serif">{item}</span>
            <span className="fl-ticker__dot">{'\u2726'}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
