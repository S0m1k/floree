import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="fl-footer">
      <div className="fl-footer__hairline" />
      <div className="fl-footer__grid">
        <div>
          <div className="fl-footer__logo">Floree</div>
          <p className="fl-footer__tag">
            Букеты, собранные руками — для тех, кто ценит цветы как способ говорить.
          </p>
        </div>
        <div>
          <div className="eyebrow">Студия</div>
          <ul className="fl-footer__list">
            <li><Link href="/catalog">Каталог</Link></li>
            <li><Link href="/shipping">Доставка и оплата</Link></li>
            <li><Link href="/checkout">Оформить заказ</Link></li>
          </ul>
        </div>
        <div>
          <div className="eyebrow">Информация</div>
          <ul className="fl-footer__list">
            <li><Link href="/offer">Публичная оферта</Link></li>
            <li><Link href="/privacy">Конфиденциальность</Link></li>
            <li><Link href="/cookies">Политика cookie</Link></li>
          </ul>
        </div>
        <div>
          <div className="eyebrow">Связь</div>
          <ul className="fl-footer__list">
            <li>Полтавский проезд, 2</li>
            <li>Санкт-Петербург</li>
            <li>Ежедневно 09:00 — 21:00</li>
            <li><a href="tel:+79930750577">+7 993 075 05 77</a></li>
          </ul>
        </div>
      </div>
      <div className="fl-footer__bottom">
        <span>&copy; Floree, {new Date().getFullYear()}</span>
        <span className="mono">floree.ru</span>
      </div>
    </footer>
  );
}
