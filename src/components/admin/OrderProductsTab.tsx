'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminCustomer, AdminInventoryItem, AdminOrderCompositionLine, AdminOrderPayment,
  AdminOrderTotals, AdminShowcaseBouquet, SimpleDictEntry,
} from '@/types';
import { fmtMoney, fmtQty } from '@/lib/format';
import AddProductModal from './AddProductModal';
import AddAdvanceForm from './AddAdvanceForm';
import DiscountMarkupModal from './DiscountMarkupModal';
import BonusPaymentModal from './BonusPaymentModal';

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
  discountReasons: SimpleDictEntry[];
  customer: AdminCustomer | null;
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

// «2,00 x 1» — the gray per-unit multiplier next to a component's quantity.
const fmtMultiplier = (n: number): string =>
  `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} x 1`;

// Activates a non-<button> clickable dt/dd on Enter/Space for keyboard users.
const activateOnKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

type DiscountModalState =
  | { kind: 'discount' | 'markup'; target: 'order' }
  | { kind: 'discount' | 'markup'; target: 'item'; itemId: string; itemTitle: string; amount: number; percent: number | null; reasonId: string | null };

export default function OrderProductsTab({
  orderId, comment, lines, totals, payments, readOnly, terminal, bouquets, items,
  discountReasons, customer,
}: Props) {
  const router = useRouter();
  const [showProductModal, setShowProductModal] = useState(false);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [discountModal, setDiscountModal] = useState<DiscountModalState | null>(null);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Composition editing (adding/removing lines) is blocked for legacy
  // (read-only) and terminal orders. Discount/markup share that rule (the
  // backend 409s a terminal order the same way); advances and bonus payment
  // are only blocked when there is nothing left to pay / no customer.
  const canEdit = !readOnly && !terminal;
  const canAdjust = !terminal;
  const canAddAdvance = Boolean(totals && totals.toPay > 0);
  const canBonus = Boolean(customer);
  const paymentsTotal = payments.reduce((sum, p) => sum + p.attributes.amount, 0);

  const refresh = () => {
    setShowProductModal(false);
    setShowAdvanceForm(false);
    setDiscountModal(null);
    setShowBonusModal(false);
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
                  {canAdjust && <th aria-label="Действия" style={{ width: 90 }} />}
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
                      {canAdjust && (
                        <td>
                          {!isComponent && (
                            <div className="admin-composition__row-actions">
                              <button
                                type="button"
                                className="admin-composition__action"
                                onClick={() => setDiscountModal({
                                  kind: 'discount', target: 'item', itemId: line.id, itemTitle: a.title,
                                  amount: a.discount, percent: a.discountPercent ?? null, reasonId: line.relationships.discountReason?.data?.id ?? null,
                                })}
                                title="Скидка на позицию"
                                aria-label={`Скидка на ${a.title}`}
                              >
                                %
                              </button>
                              <button
                                type="button"
                                className="admin-composition__action"
                                onClick={() => setDiscountModal({
                                  kind: 'markup', target: 'item', itemId: line.id, itemTitle: a.title,
                                  amount: a.markup, percent: a.markupPercent ?? null, reasonId: line.relationships.markupReason?.data?.id ?? null,
                                })}
                                title="Надбавка на позицию"
                                aria-label={`Надбавка на ${a.title}`}
                              >
                                +
                              </button>
                              {canEdit && (
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
                            </div>
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

              <dt
                className={canAdjust ? 'admin-order-totals__clickable' : ''}
                role={canAdjust ? 'button' : undefined}
                tabIndex={canAdjust ? 0 : undefined}
                onClick={canAdjust ? () => setDiscountModal({ kind: 'discount', target: 'order' }) : undefined}
                onKeyDown={canAdjust ? activateOnKey(() => setDiscountModal({ kind: 'discount', target: 'order' })) : undefined}
              >
                Скидка
              </dt>
              <dd
                className={canAdjust ? 'admin-order-totals__clickable' : ''}
                role={canAdjust ? 'button' : undefined}
                tabIndex={canAdjust ? 0 : undefined}
                onClick={canAdjust ? () => setDiscountModal({ kind: 'discount', target: 'order' }) : undefined}
                onKeyDown={canAdjust ? activateOnKey(() => setDiscountModal({ kind: 'discount', target: 'order' })) : undefined}
              >
                {fmtMoney(totals.discount)}
              </dd>
              <dt className="admin-order-totals__sub">в т.ч. на цветы</dt>
              <dd className="admin-order-totals__sub">{fmtMoney(totals.discountBreakdown.flowers)}</dd>
              <dt className="admin-order-totals__sub">в т.ч. на букеты</dt>
              <dd className="admin-order-totals__sub">{fmtMoney(totals.discountBreakdown.bouquets)}</dd>
              <dt className="admin-order-totals__sub">в т.ч. на заказ</dt>
              <dd className="admin-order-totals__sub">{fmtMoney(totals.discountBreakdown.order)}</dd>

              <dt
                className={canAdjust ? 'admin-order-totals__clickable' : ''}
                role={canAdjust ? 'button' : undefined}
                tabIndex={canAdjust ? 0 : undefined}
                onClick={canAdjust ? () => setDiscountModal({ kind: 'markup', target: 'order' }) : undefined}
                onKeyDown={canAdjust ? activateOnKey(() => setDiscountModal({ kind: 'markup', target: 'order' })) : undefined}
              >
                Надбавка
              </dt>
              <dd
                className={canAdjust ? 'admin-order-totals__clickable' : ''}
                role={canAdjust ? 'button' : undefined}
                tabIndex={canAdjust ? 0 : undefined}
                onClick={canAdjust ? () => setDiscountModal({ kind: 'markup', target: 'order' }) : undefined}
                onKeyDown={canAdjust ? activateOnKey(() => setDiscountModal({ kind: 'markup', target: 'order' })) : undefined}
              >
                {fmtMoney(totals.markup)}
              </dd>
              <dt className="admin-order-totals__sub">в т.ч. на цветы</dt>
              <dd className="admin-order-totals__sub">{fmtMoney(totals.markupBreakdown.flowers)}</dd>
              <dt className="admin-order-totals__sub">в т.ч. на букеты</dt>
              <dd className="admin-order-totals__sub">{fmtMoney(totals.markupBreakdown.bouquets)}</dd>
              <dt className="admin-order-totals__sub">в т.ч. на заказ</dt>
              <dd className="admin-order-totals__sub">{fmtMoney(totals.markupBreakdown.order)}</dd>

              <dt
                className={canBonus ? 'admin-order-totals__clickable' : ''}
                role={canBonus ? 'button' : undefined}
                tabIndex={canBonus ? 0 : undefined}
                onClick={canBonus ? () => setShowBonusModal(true) : undefined}
                onKeyDown={canBonus ? activateOnKey(() => setShowBonusModal(true)) : undefined}
                title={canBonus ? undefined : 'У заказа не выбран клиент'}
              >
                Оплата бонусами
              </dt>
              <dd
                className={canBonus ? 'admin-order-totals__clickable' : ''}
                role={canBonus ? 'button' : undefined}
                tabIndex={canBonus ? 0 : undefined}
                onClick={canBonus ? () => setShowBonusModal(true) : undefined}
                onKeyDown={canBonus ? activateOnKey(() => setShowBonusModal(true)) : undefined}
              >
                {fmtQty(totals.bonusPaid)}
              </dd>

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
      {discountModal && totals && (
        <DiscountMarkupModal
          orderId={orderId}
          kind={discountModal.kind}
          target={discountModal.target}
          itemId={discountModal.target === 'item' ? discountModal.itemId : undefined}
          itemTitle={discountModal.target === 'item' ? discountModal.itemTitle : undefined}
          currentAmount={
            discountModal.target === 'item'
              ? discountModal.amount
              : (discountModal.kind === 'discount' ? totals.discountBreakdown.order : totals.markupBreakdown.order)
          }
          currentPercent={
            discountModal.target === 'item'
              ? discountModal.percent
              : (discountModal.kind === 'discount' ? totals.orderDiscountPercent : totals.orderMarkupPercent)
          }
          currentReasonId={
            discountModal.target === 'item'
              ? discountModal.reasonId
              : (discountModal.kind === 'discount' ? totals.orderDiscountReasonId : totals.orderMarkupReasonId)
          }
          reasons={discountReasons}
          onClose={() => setDiscountModal(null)}
          onSaved={refresh}
        />
      )}
      {showBonusModal && totals && customer && (
        <BonusPaymentModal
          orderId={orderId}
          balance={customer.attributes.currentPoints}
          currentBonusPaid={totals.bonusPaid}
          toPay={totals.toPay}
          onClose={() => setShowBonusModal(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
