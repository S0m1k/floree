'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminInventoryItem, AdminOrderCompositionLine, AdminOrderPayment,
  AdminOrderTotals, AdminShowcaseBouquet,
} from '@/types';
import { fmtMoney } from '@/lib/format';
import AddProductModal from './AddProductModal';
import AddAdvanceForm from './AddAdvanceForm';

interface Props {
  orderId: string;
  comment: string;
  lines: AdminOrderCompositionLine[];
  totals: AdminOrderTotals | null;
  payments: AdminOrderPayment[];
  readOnly: boolean;
  terminal: boolean;
  bouquets: AdminShowcaseBouquet[];
  items: AdminInventoryItem[];
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  sbp: 'СБП',
  transfer: 'Перевод',
};

// «пт, 10 июл. 19:22» — the payment history date format on the live screen.
const fmtPaymentDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace('.,', '.');
};

const fmtQty = (n: number): string =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(n);

// «2,00 x 1» — the gray per-unit multiplier next to a component's quantity.
const fmtMultiplier = (n: number): string =>
  `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} x 1`;

export default function OrderProductsTab({
  orderId, comment, lines, totals, payments, readOnly, terminal, bouquets, items,
}: Props) {
  const router = useRouter();
  const [showProductModal, setShowProductModal] = useState(false);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Composition editing is blocked for legacy (read-only) and terminal orders;
  // advances are only blocked when there is nothing left to pay.
  const canEdit = !readOnly && !terminal;
  const canAddAdvance = Boolean(totals && totals.toPay > 0);
  const paymentsTotal = payments.reduce((sum, p) => sum + p.attributes.amount, 0);

  const refresh = () => {
    setShowProductModal(false);
    setShowAdvanceForm(false);
    router.refresh();
  };

  const removeLine = async (itemId: string) => {
    setDeletingId(itemId);
    setError(null);
    try {
      const res = await fetch(`/admin/api/orders/${orderId}/items/${itemId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить позицию');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="admin-panel">
        <p className="admin-panel__title">Пожелания клиента</p>
        <div style={{ padding: '10px 16px 16px' }}>
          <div className="admin-order-comment">
            <span className="admin-order-comment__label">Комментарий к заказу</span>
            <span>{comment || 'Нет комментария'}</span>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <p className="admin-panel__title">Состав заказа</p>
        {lines.length === 0 ? (
          <div className="admin-empty">В заказе пока нет позиций.</div>
        ) : (
          <div className="admin-table-wrap" style={{ border: 'none', margin: '10px 16px 6px', width: 'auto' }}>
            <table className="admin-table admin-composition">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Цена</th>
                  <th>Количество</th>
                  <th>Единица измерения</th>
                  <th>Сумма</th>
                  {canEdit && <th aria-label="Действия" style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const a = line.attributes;
                  const isComponent = Boolean(line.relationships.parent?.data);
                  const isBouquet = a.kind === 'bouquet' && !isComponent;
                  const adjusted = a.sum !== a.originalSum;
                  return (
                    <tr key={line.id} className={isBouquet ? 'admin-composition__bouquet' : ''}>
                      <td>
                        <span className={`admin-composition__name ${isComponent ? 'admin-composition__name--nested' : ''}`}>
                          <span className="admin-composition__thumb" aria-hidden>🌸</span>
                          {isComponent
                            ? <a className="admin-composition__link">{a.title}</a>
                            : <span>{a.title}</span>}
                        </span>
                      </td>
                      <td>
                        {isComponent ? (
                          <span>
                            {fmtMoney(a.unitPrice)}{' '}
                            <span className="admin-composition__multiplier">{fmtMultiplier(a.quantity)}</span>
                          </span>
                        ) : (
                          fmtMoney(a.unitPrice)
                        )}
                      </td>
                      <td>{fmtQty(a.quantity)}</td>
                      <td>{a.measure}</td>
                      <td>
                        {adjusted ? (
                          <span>
                            <s className="admin-composition__old-sum">{fmtMoney(a.originalSum)}</s>{' '}
                            <strong>{fmtMoney(a.sum)}</strong>
                          </span>
                        ) : (
                          isBouquet ? <strong>{fmtMoney(a.sum)}</strong> : fmtMoney(a.sum)
                        )}
                      </td>
                      {canEdit && (
                        <td>
                          {!isComponent && (
                            <button
                              type="button"
                              className="admin-composition__delete"
                              onClick={() => removeLine(line.id)}
                              disabled={deletingId === line.id}
                              aria-label={`Удалить ${a.title}`}
                              title="Удалить позицию"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {readOnly && lines.length > 0 && (
          <p className="admin-order-note">
            Состав импортирован из Posiflora и доступен только для чтения.
          </p>
        )}
        {(canEdit || canAddAdvance) && (
          <div className="admin-form-actions" style={{ justifyContent: 'flex-start', padding: '0 16px 16px' }}>
            {canEdit && (
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => setShowProductModal(true)}>
                Добавить продукт
              </button>
            )}
            {canAddAdvance && (
              <button type="button" className="admin-btn admin-btn--outline-blue" onClick={() => setShowAdvanceForm(true)}>
                Добавить аванс
              </button>
            )}
          </div>
        )}
        {error && <div className="admin-form-error" style={{ margin: '0 16px 16px' }}>{error}</div>}
      </section>

      <div className="admin-order-summary-grid">
        <section className="admin-panel">
          <p className="admin-panel__title">История платежей</p>
          {payments.length === 0 ? (
            <div className="admin-empty">Платежей пока нет.</div>
          ) : (
            <div className="admin-table-wrap" style={{ border: 'none', margin: '10px 16px 16px', width: 'auto' }}>
              <table className="admin-table" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Способ оплаты</th>
                    <th>Дата</th>
                    <th>Фискализация аванса</th>
                    <th>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const pa = p.attributes;
                    const method = pa.method
                      ? METHOD_LABELS[pa.method] || pa.method
                      : (pa.terminalTransactionId ? 'Онлайн (Т-Банк)' : 'Онлайн');
                    return (
                      <tr key={p.id}>
                        <td>{method}</td>
                        <td>{fmtPaymentDate(pa.createdAt ?? pa.date)}</td>
                        <td>{pa.fiscalized ? 'Да' : 'Нет'}</td>
                        <td>{fmtMoney(pa.amount)}</td>
                      </tr>
                    );
                  })}
                  <tr className="admin-order-payments-total">
                    <td><strong>ИТОГО</strong></td>
                    <td />
                    <td />
                    <td><strong>{fmtMoney(paymentsTotal)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {totals && (
          <section className="admin-panel admin-order-totals">
            <dl className="admin-order-totals__list">
              <dt>Продуктов</dt><dd>{fmtQty(totals.productsCount)}</dd>
              <dt>Букетов</dt><dd>{totals.bouquetsCount}</dd>
              <dt>Итого</dt><dd>{fmtMoney(totals.itemsTotal)}</dd>
              <dt>Скидка</dt><dd>{fmtMoney(totals.discount)}</dd>
              <dt>Надбавка</dt><dd>{fmtMoney(totals.markup)}</dd>
              <dt className="admin-order-totals__sub">в т.ч. на цветы</dt>
              <dd className="admin-order-totals__sub">{fmtMoney(totals.markupBreakdown.flowers)}</dd>
              <dt className="admin-order-totals__sub">в т.ч. на букеты</dt>
              <dd className="admin-order-totals__sub">{fmtMoney(totals.markupBreakdown.bouquets)}</dd>
              <dt className="admin-order-totals__sub">в т.ч. на заказ</dt>
              <dd className="admin-order-totals__sub">{fmtMoney(totals.markupBreakdown.order)}</dd>
              <dt>Оплата бонусами</dt><dd>{fmtQty(totals.bonusPaid)}</dd>
              <dt>Авансы</dt><dd>{fmtMoney(totals.advances)}</dd>
              <dt>Общая стоимость заказа</dt><dd>{fmtMoney(totals.grandTotal)}</dd>
            </dl>
            <div className="admin-order-totals__to-pay">
              <span>К оплате</span>
              <span>{fmtMoney(totals.toPay)}</span>
            </div>
          </section>
        )}
      </div>

      {showProductModal && (
        <AddProductModal
          orderId={orderId}
          bouquets={bouquets}
          items={items}
          onClose={() => setShowProductModal(false)}
          onAdded={refresh}
        />
      )}
      {showAdvanceForm && totals && (
        <AddAdvanceForm
          orderId={orderId}
          toPay={totals.toPay}
          onClose={() => setShowAdvanceForm(false)}
          onAdded={refresh}
        />
      )}
    </div>
  );
}
