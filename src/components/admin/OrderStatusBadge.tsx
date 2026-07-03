import { STATUS_TABS } from '@/lib/adminOrders';

const LABELS: Record<string, string> = Object.fromEntries(
  STATUS_TABS.filter((t) => t.value).map((t) => [t.value, t.label])
);

export default function OrderStatusBadge({ status }: { status: string }) {
  return <span className={`admin-badge admin-badge--${status}`}>{LABELS[status] || status}</span>;
}
