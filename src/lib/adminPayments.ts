import { adminFetch } from './adminApi';

// Data layer for «Оплата и промокоды» (/admin/payment-settings): the T-Bank
// acquiring credentials and the storefront promo-code dictionary.

export interface PaymentSettingsAttributes {
  activeProvider: 'tbank' | 'yandex';
  terminalKey: string | null;
  hasSecret: boolean;
  yapayMerchantId: string | null;
  hasYapayApiKey: boolean;
  yapaySandbox: boolean;
  updatedAt: string | null;
}

export interface PromoCodeAttributes {
  code: string;
  percent: number;
  isActive: boolean;
  updatedAt: string | null;
}

export async function getPaymentSettings(): Promise<PaymentSettingsAttributes | null> {
  const res = await adminFetch('/api/v1/payment-settings');
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.attributes ?? null;
}

export async function getPromoCodes(): Promise<PromoCodeAttributes[]> {
  const res = await adminFetch('/api/v1/promo-codes');
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data || []).map((r: { attributes: PromoCodeAttributes }) => r.attributes);
}
