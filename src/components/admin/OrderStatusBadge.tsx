import { STATUS_TABS } from '@/lib/orderStatus';

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_TABS.filter((t) => t.value).map((t) => [t.value, t.label])
);

// The real admin renders order status as plain text in list tables, but as a
// colored pill in the order detail header (docs/posiflora/admin-map.md §2.2.1).
export default function OrderStatusBadge({ status, variant = 'pill' }: { status: string; variant?: 'pill' | 'text' }) {
  const label = STATUS_LABELS[status] || status;
  if (variant === 'text') return <span>{label}</span>;
  return <span className={`admin-status-pill admin-status-pill--${status}`}>{label}</span>;
}
