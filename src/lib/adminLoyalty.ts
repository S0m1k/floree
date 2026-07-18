import {
  AdminBonusCard,
  AdminBonusGroup,
  AdminBonusGroupHistoryEntry,
  AdminDiscountGroup,
} from '@/types';
import { adminFetch } from './adminApi';

// Data layer for «Клиенты и развитие → Система лояльности» (admin-map
// §2.5.4-2.5.6): bonus groups, discount groups, bonus-card (Wallet)
// templates, and a customer's bonus-group change history.

export async function getBonusGroups(): Promise<AdminBonusGroup[]> {
  const res = await adminFetch('/api/v1/bonus-groups?page[size]=200');
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function getDiscountGroups(): Promise<AdminDiscountGroup[]> {
  const res = await adminFetch('/api/v1/discount-groups?page[size]=200');
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function getBonusCards(): Promise<AdminBonusCard[]> {
  const res = await adminFetch('/api/v1/bonus-cards?page[size]=200');
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

// «История изменения бонусных групп» (карточка клиента, вкладка «Бонусы»).
export async function getCustomerBonusGroupHistory(
  customerId: string,
): Promise<AdminBonusGroupHistoryEntry[]> {
  const res = await adminFetch(`/api/v1/customers/${customerId}/bonus-group-history`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}
