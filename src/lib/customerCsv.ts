import { AdminCustomer } from '@/types';
import { buildCsv } from './csv';

// Columns mirror the «Клиенты» table (admin-map §2.5.1): Имя | Телефон |
// Средний чек | Заказов на сумму | Кол-во заказов | Бонусы | Дата рождения.
// Shared by the server-side export route and the client-side "export
// selection" button so both produce byte-identical files.
const HEADERS = ['Имя', 'Телефон', 'Средний чек', 'Заказов на сумму', 'Кол-во заказов', 'Бонусы', 'Дата рождения'];

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU');
}

export function customersToCsv(customers: AdminCustomer[]): string {
  const rows = customers.map((c) => {
    const a = c.attributes;
    return [
      a.title || 'Без имени',
      a.phone,
      a.ordersQty > 0 ? String(Math.round(a.averageCheck)) : '',
      a.ordersQty > 0 ? String(Math.round(a.ordersAmount)) : '',
      String(a.ordersQty),
      String(a.currentPoints),
      fmtDate(a.birthday),
    ];
  });
  return buildCsv(HEADERS, rows);
}
