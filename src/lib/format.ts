// Shared display formatters for the admin (Posiflora clone) screens — matches
// the ru-RU money/date formatting used across src/app/admin/**.

export const fmtMoney = (n: number): string =>
  `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ₽`;

// Quantity/points formatter — up to 3 fractional digits, no unit suffix.
// Used for «Продуктов» counts and «Оплата бонусами» amounts.
export const fmtQty = (n: number): string =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(n);

export const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU');
};

export const fmtDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};
