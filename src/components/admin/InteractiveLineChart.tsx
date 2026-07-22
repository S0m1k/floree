'use client';

import { useState } from 'react';

export interface ChartPoint {
  label: string;
  amount: number;
  tooltip: string;
}

interface Props {
  points: ChartPoint[];
  axisStart: string;
  axisEnd: string;
  totalLabel: string;
}

const WIDTH = 700;
const HEIGHT = 200;

// Line-чарт дашбордов: клик/тап по точке (или по столбику её окрестности)
// показывает значение в плашке над точкой; повторный клик прячет.
export default function InteractiveLineChart({ points, axisStart, axisEnd, totalLabel }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  if (points.length === 0 || points.every((p) => p.amount === 0)) {
    return <div className="admin-line-chart__empty">Нет данных для построения графика.</div>;
  }

  const max = Math.max(1, ...points.map((p) => p.amount));
  const stepX = points.length > 1 ? WIDTH / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = points.length > 1 ? i * stepX : WIDTH / 2;
    const y = HEIGHT - (p.amount / max) * (HEIGHT - 8) - 4;
    return { x, y, p };
  });
  const linePath = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `0,${HEIGHT} ${linePath} ${WIDTH},${HEIGHT}`;

  const current = selected != null ? coords[selected] : null;
  // Плашка позиционируется в процентах контейнера; у краёв — прижимается.
  const bubbleLeftPct = current ? Math.min(88, Math.max(12, (current.x / WIDTH) * 100)) : 0;

  const toggle = (i: number) => setSelected((prev) => (prev === i ? null : i));

  return (
    <div>
      <div className="admin-line-chart__wrap">
        {current && (
          <div
            className="admin-line-chart__bubble"
            style={{ left: `${bubbleLeftPct}%`, top: `${(current.y / HEIGHT) * 100}%` }}
          >
            {current.p.tooltip}
          </div>
        )}
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="admin-line-chart" role="img" aria-label="График">
          <polygon className="admin-line-chart__area" points={areaPath} />
          <polyline className="admin-line-chart__line" points={linePath} />
          {current && (
            <line
              className="admin-line-chart__guide"
              x1={current.x} y1={0} x2={current.x} y2={HEIGHT}
            />
          )}
          {coords.map((c, i) => (
            <g key={`${c.p.label}-${i}`}>
              <circle
                className={`admin-line-chart__dot ${selected === i ? 'admin-line-chart__dot--active' : ''}`}
                cx={c.x} cy={c.y} r={selected === i ? 4.5 : 2.5}
              />
              {/* Невидимая широкая зона тапа — по колонке точки на всю высоту. */}
              <rect
                className="admin-line-chart__hit"
                x={c.x - (stepX || WIDTH) / 2} y={0}
                width={stepX || WIDTH} height={HEIGHT}
                onClick={() => toggle(i)}
              />
            </g>
          ))}
        </svg>
      </div>
      <div className="admin-line-chart__axis">
        <span>{axisStart}</span>
        <span>{totalLabel}</span>
        <span>{axisEnd}</span>
      </div>
    </div>
  );
}
