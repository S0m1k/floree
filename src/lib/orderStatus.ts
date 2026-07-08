// Client-safe order-status constants. Kept free of any server-only imports
// (no next/headers) so client components — OrderStatusBadge, OrderStatusControl
// — can import them without pulling the server data layer into the bundle.

export const STATUS_TABS: { value: string; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'assembled', label: 'Собранные' },
  { value: 'cancelled', label: 'Отменённые' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'return', label: 'Возврат' },
  { value: 'credit', label: 'Кредит' },
  { value: 'courier', label: 'У курьера' },
];

// Terminal statuses can't be changed once reached (mirrors backend
// TERMINAL_STATUSES; admin-map.md §2.2.1) — the detail-page badge is inert.
export const TERMINAL_STATUSES: readonly string[] = ['completed', 'cancelled', 'return'];
