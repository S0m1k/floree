"""Shared helpers for the admin analytics dashboard (v1_analytics.py).

Day-bucketing is done in Python (not DB-side date-trunc) so the same code
works against SQLite (tests) and Postgres (prod) — same convention as
`routers/v1_customers.py::get_customer_spend`.
"""

from datetime import date, datetime, timedelta


def parse_date(s: str | None, default: date) -> date:
    if not s:
        return default
    try:
        return date.fromisoformat(s)
    except ValueError:
        return default


def period_bounds(qs, default_from: date | None = None, today: date | None = None):
    """Returns (period_from, period_to, prev_from, prev_to) — the requested
    period plus the immediately-preceding period of equal length, used for
    the "% к прошлому периоду" deltas."""
    today = today or date.today()
    default_from = default_from or today.replace(day=1)
    period_from = parse_date(qs.get("from"), default_from)
    period_to = parse_date(qs.get("to"), today)
    if period_to < period_from:
        period_from, period_to = period_to, period_from

    period_len = (period_to - period_from).days + 1
    prev_to = period_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=period_len - 1)
    return period_from, period_to, prev_from, prev_to


def dt_bounds(d_from: date, d_to: date) -> tuple[datetime, datetime]:
    """Inclusive [start-of-day, end-of-day] datetime bounds for a date range."""
    return datetime.combine(d_from, datetime.min.time()), datetime.combine(d_to, datetime.max.time())


def pct_change(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def daily_series(pairs: list[tuple], d_from: date, d_to: date, max_days: int = 400) -> list[dict]:
    """Bucket (datetime_or_date, amount) pairs into a full day-by-day series
    covering [d_from, d_to] inclusive, filling zeros for days with no rows.
    `amount` is summed per day; pass 1 for pure counts.
    """
    by_day: dict[str, float] = {}
    for ts, amount in pairs:
        day = ts.date().isoformat() if isinstance(ts, datetime) else str(ts)
        by_day[day] = by_day.get(day, 0.0) + float(amount or 0)

    days: list[dict] = []
    d = d_from
    count = 0
    while d <= d_to and count < max_days:
        key = d.isoformat()
        days.append({"date": key, "amount": round(by_day.get(key, 0.0), 2)})
        d += timedelta(days=1)
        count += 1
    return days


WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]  # Python weekday(): Mon=0
