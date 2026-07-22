import Link from 'next/link';
import { DaySeriesPoint } from '@/types';
import InteractiveLineChart from '@/components/admin/InteractiveLineChart';

export const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
export const fmtNum = (n: number) => new Intl.NumberFormat('ru-RU').format(n);

// -------- Шапка дашборда (admin-map §2.1) --------
//
// 4 вкладки дашборда живут на отдельных маршрутах (не ?tab=) так, чтобы
// прямые ссылки из подменю сайдбара («Клиенты → Аналитика» и т.п.) работали.
// Каждая тонкая страница-обёртка (/admin/customers/analytic,
// /admin/showcase/analytics, /admin/warehouse/analytics, и /admin/retail-stores
// само для «Деньги») рендерит этот же заголовок с собственным `active`.
export const DASHBOARD_TABS = [
  { key: 'money', label: 'Деньги', href: '/admin/retail-stores' },
  { key: 'customers', label: 'Клиенты', href: '/admin/customers/analytic' },
  { key: 'bouquets', label: 'Букеты в магазине', href: '/admin/showcase/analytics' },
  { key: 'warehouse', label: 'Склад', href: '/admin/warehouse/analytics' },
] as const;

export type DashboardTabKey = (typeof DASHBOARD_TABS)[number]['key'];

export function DashboardHeader({
  active, from, to, updatedAt, periodFormAction,
}: {
  active: DashboardTabKey; from: string; to: string; updatedAt: string; periodFormAction: string;
}) {
  return (
    <>
      <div className="admin-dash-topbar">
        <div className="admin-dash-topbar__left">
          <h1 className="admin-title" style={{ margin: 0 }}>Floree</h1>
          {/* Касса — оперативный остаток кассы не отслеживается ни в одной
              таблице, честно показываем 0 (см. финальный отчёт). */}
          <span className="admin-dash-topbar__till">В кассе <strong>0 ₽</strong></span>
          <div className="admin-dash-topbar__links">
            <span className="admin-dash-link admin-dash-link--disabled" title="Раздел ещё не реализован">Инструкция</span>
            <span className="admin-dash-link admin-dash-link--disabled" title="Раздел ещё не реализован">Настройки точки продаж</span>
          </div>
        </div>
        <div className="admin-dashboard-header__meta">Данные обновлены: {updatedAt}</div>
      </div>

      <div className="admin-dashboard-header" style={{ marginBottom: 8 }}>
        <nav className="admin-subtabs">
          {DASHBOARD_TABS.map((t) => (
            <Link
              key={t.key}
              href={`${t.href}?from=${from}&to=${to}`}
              className={`admin-subtab ${active === t.key ? 'admin-subtab--active' : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form method="GET" action={periodFormAction} className="admin-period-form">
          <input type="date" name="from" defaultValue={from} />
          <span>—</span>
          <input type="date" name="to" defaultValue={to} />
          <button type="submit" className="admin-btn admin-btn--primary">Применить</button>
        </form>
      </div>
    </>
  );
}

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

// -------- Line-чарт (интерактивный клиентский компонент) --------

interface SeriesPoint { label: string; amount: number; tooltip: string }

// Значение точки показывается по клику/тапу (InteractiveLineChart) — сервер
// передаёт готовые сериализуемые точки с текстом плашки.
function SeriesLineChart({
  points, axisStart, axisEnd, totalLabel,
}: { points: SeriesPoint[]; axisStart: string; axisEnd: string; totalLabel: string }) {
  return (
    <InteractiveLineChart
      points={points}
      axisStart={axisStart}
      axisEnd={axisEnd}
      totalLabel={totalLabel}
    />
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

