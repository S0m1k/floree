import Link from 'next/link';
import { DaySeriesPoint } from '@/types';

export const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
export const fmtNum = (n: number) => new Intl.NumberFormat('ru-RU').format(n);

export const fmtDelta = (pct: number | null) => {
  if (pct === null) return null;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct}% к прошлому периоду`;
};

export const fmtDateLong = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

// -------- KPI-карточки --------

/**
 * KPI-карточка с ролью radio-кнопки: клик переключает `param` в URL, что
 * заставляет сервер перерендерить страницу с этой метрикой выбранной (та же
 * server-driven модель, что и период-пикер — без клиентского JS).
 */
export function RadioMetricCard({
  label, value, deltaPct, href, selected, unavailable,
}: {
  label: string; value: string; deltaPct?: number | null; href: string; selected: boolean; unavailable?: boolean;
}) {
  const delta = deltaPct !== undefined ? fmtDelta(deltaPct) : null;
  return (
    <Link
      href={href}
      className={`admin-metric-card admin-metric-card--radio ${selected ? 'admin-metric-card--selected' : ''}`}
    >
      <div className="admin-metric-card__label">
        <span className="admin-metric-card__radio-dot" />
        {label}
      </div>
      <div className={`admin-metric-card__value ${unavailable ? 'admin-metric-card__value--muted' : ''}`}>
        {unavailable ? 'Нет данных' : value}
      </div>
      {delta && (
        <div className={`admin-metric-card__delta ${(deltaPct || 0) >= 0 ? 'admin-metric-card__delta--up' : 'admin-metric-card__delta--down'}`}>
          {delta}
        </div>
      )}
    </Link>
  );
}

// -------- Цветные плитки --------

export function DashTile({
  title, value, delta, variant = 'white',
}: {
  title: string; value: string; delta?: string | null; variant?: 'green' | 'orange' | 'white';
}) {
  return (
    <div className={`admin-dash-tile ${variant !== 'white' ? `admin-dash-tile--${variant}` : ''}`}>
      <div className="admin-dash-tile__title">{title}</div>
      <div className="admin-dash-tile__row">
        <span className="admin-dash-tile__value">{value}</span>
      </div>
      {delta && <div className="admin-dash-tile__delta">{delta}</div>}
    </div>
  );
}

// -------- Line-чарт (SVG, серверный рендер, без библиотек) --------

interface SeriesPoint { label: string; amount: number; tooltip: string }

function SeriesLineChart({
  points, axisStart, axisEnd, totalLabel,
}: { points: SeriesPoint[]; axisStart: string; axisEnd: string; totalLabel: string }) {
  if (points.length === 0 || points.every((p) => p.amount === 0)) {
    return <div className="admin-line-chart__empty">Нет данных для построения графика.</div>;
  }
  const width = 700;
  const height = 200;
  const max = Math.max(1, ...points.map((p) => p.amount));
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = points.length > 1 ? i * stepX : width / 2;
    const y = height - (p.amount / max) * (height - 8) - 4;
    return { x, y, p };
  });
  const linePath = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `0,${height} ${linePath} ${width},${height}`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="admin-line-chart" role="img" aria-label="График">
        <polygon className="admin-line-chart__area" points={areaPath} />
        <polyline className="admin-line-chart__line" points={linePath} />
        {coords.map((c) => (
          <circle key={c.p.label} className="admin-line-chart__dot" cx={c.x} cy={c.y} r={2.5}>
            <title>{c.p.tooltip}</title>
          </circle>
        ))}
      </svg>
      <div className="admin-line-chart__axis">
        <span>{axisStart}</span>
        <span>{totalLabel}</span>
        <span>{axisEnd}</span>
      </div>
    </div>
  );
}

export function LineChart({ days, totalLabel }: { days: DaySeriesPoint[]; totalLabel?: string }) {
  const total = days.reduce((s, d) => s + d.amount, 0);
  const points = days.map((d) => ({
    label: d.date, amount: d.amount, tooltip: `${fmtDateLong(d.date)}: ${fmtMoney(d.amount)}`,
  }));
  return (
    <SeriesLineChart
      points={points}
      axisStart={days.length ? fmtDateLong(days[0].date) : ''}
      axisEnd={days.length ? fmtDateLong(days[days.length - 1].date) : ''}
      totalLabel={totalLabel || `Итого: ${fmtMoney(total)}`}
    />
  );
}

/** Line-чарт по часам суток 0:00–23:00 (вкладка «Букеты в магазине»). */
export function HourlyChart({ hours, totalLabel }: { hours: { hour: number; revenue: number }[]; totalLabel?: string }) {
  const total = hours.reduce((s, h) => s + h.revenue, 0);
  const points = hours.map((h) => ({
    label: String(h.hour), amount: h.revenue, tooltip: `${String(h.hour).padStart(2, '0')}:00 — ${fmtMoney(h.revenue)}`,
  }));
  return (
    <SeriesLineChart
      points={points}
      axisStart="0:00"
      axisEnd="23:00"
      totalLabel={totalLabel || `Итого: ${fmtMoney(total)}`}
    />
  );
}

// -------- Бар-чарт по дням недели (Пн–Вс) --------

export function WeekdayChart({ data }: { data: { label: string; count: number; isWeekend: boolean }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="admin-weekday-chart">
        {data.map((d) => (
          <div key={d.label} className="admin-weekday-chart__col">
            <span className="admin-weekday-chart__count">{d.count > 0 ? `+${fmtNum(d.count)}` : '0'}</span>
            <div
              className={`admin-weekday-chart__bar ${d.isWeekend ? 'admin-weekday-chart__bar--weekend' : ''}`}
              style={{ height: `${Math.max(2, Math.round((d.count / max) * 100))}%` }}
            />
          </div>
        ))}
      </div>
      <div className="admin-weekday-chart__label">
        {data.map((d) => <span key={d.label}>{d.label}</span>)}
      </div>
    </div>
  );
}

