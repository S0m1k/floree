'use client';

import { CartLine, fmtMoney } from './PosTerminal';

interface Props {
  cart: CartLine[];
  total: number;
  changeQty: (line: CartLine, delta: number) => void;
  removeLine: (line: CartLine) => void;
  canPay: boolean;
  onPay: () => void;
}

// «Корзина» — состав будущей продажи и кнопка «Оплата», как в терминале
// Posiflora: строка = название, кол-во × цена, сумма.
export default function PosCartTab({ cart, total, changeQty, removeLine, canPay, onPay }: Props) {
  return (
    <div className="pos__tab pos__tab--cart">
      <h1 className="pos__title">Корзина</h1>

      {cart.length === 0 ? (
        <div className="pos__empty">Корзина пуста — добавьте букет с витрины или товар</div>
      ) : (
        <ul className="pos__cart-list">
          {cart.map((l, idx) => (
            <li key={`${l.kind}-${l.id}-${idx}`} className="pos__cart-line">
              <div className="pos__cart-info">
                <span className="pos__cart-title">{l.title}</span>
                <span className="pos__cart-meta">
                  {l.qty} шт × {fmtMoney(l.price)}
                </span>
              </div>
              <div className="pos__cart-controls">
                {l.kind === 'item' && (
                  <>
                    <button type="button" className="pos__qty-btn" onClick={() => changeQty(l, -1)}>−</button>
                    <button type="button" className="pos__qty-btn" onClick={() => changeQty(l, 1)}>+</button>
                  </>
                )}
                <span className="pos__cart-sum">{fmtMoney(l.price * l.qty)}</span>
                <button type="button" className="pos__qty-btn pos__qty-btn--remove" onClick={() => removeLine(l)} aria-label="Убрать">
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="pos__cart-bottom">
        <div className="pos__total">
          <span>Итого</span>
          <strong>{fmtMoney(total)}</strong>
        </div>
        <button type="button" className="pos__pay" disabled={!canPay} onClick={onPay}>
          Оплата
        </button>
      </div>
    </div>
  );
}
