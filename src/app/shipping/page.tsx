import Link from 'next/link';
import Reveal from '@/components/Reveal';

export const metadata = {
  title: 'Доставка и оплата — Floree',
  description: 'Условия доставки букетов по Санкт-Петербургу и способы оплаты.',
};

const faqs = [
  { q: 'Сколько стоит доставка?', a: 'Стоимость доставки рассчитывается индивидуально в зависимости от района и времени. Свяжитесь с нами, и мы рассчитаем стоимость.' },
  { q: 'Можно ли заказать доставку к точному времени?', a: 'Да, при оформлении укажите желаемое время. Мы постараемся доставить точно в срок. При заказе менее чем за 2 часа время согласовывается дополнительно.' },
  { q: 'Как оплатить заказ?', a: 'Оплата производится онлайн картой (Visa, Mastercard, МИР) через защищённый эквайринг Т-Банка. После оформления вы будете перенаправлены на страницу оплаты.' },
  { q: 'Что если букет не понравится?', a: 'Если у вас есть претензии к букету, свяжитесь с нами в течение 24 часов после получения с фотографией — мы обязательно решим вопрос.' },
];

export default function ShippingPage() {
  return (
    <div className="pg-root">
      {/* Hero */}
      <section className="pg-ship__hero">
        <Reveal kind="up"><div className="eyebrow">&mdash; Доставка и оплата</div></Reveal>
        <Reveal kind="up" delay={120}>
          <h1 className="pg-ship__title">
            Доставка<br />и&nbsp;<em>оплата</em>.
          </h1>
        </Reveal>
      </section>

      {/* Intro */}
      <section className="pg-ship__intro">
        <Reveal kind="up">
          <p className="pg-ship__intro-lede serif">
            Мы&nbsp;доставляем заказы ежедневно <em>с&nbsp;9:00 до&nbsp;21:00</em>.
          </p>
        </Reveal>
        <Reveal kind="up" delay={120}>
          <p className="pg-ship__intro-p">
            Стоимость доставки рассчитывается индивидуально
            в&nbsp;зависимости от&nbsp;времени доставки и&nbsp;отдалённости конечной точки.
          </p>
        </Reveal>
        <Reveal kind="up" delay={200}>
          <p className="pg-ship__intro-p">
            Наши флористы с&nbsp;радостью сделают для&nbsp;вас предварительный расчёт
            при&nbsp;согласовании букета.
          </p>
        </Reveal>
        <Reveal kind="up" delay={280}>
          <div className="pg-ship__note">
            <span className="mono">&mdash; важно</span>
            <p>
              Если получателя не&nbsp;оказалось на&nbsp;месте в&nbsp;указанный промежуток времени,
              повторный выезд курьера оплачивается дополнительно.
            </p>
          </div>
        </Reveal>
      </section>

      {/* Payment */}
      <section className="pg-ship__pay">
        <Reveal kind="up">
          <div className="eyebrow">&mdash; Оплата</div>
          <h3 className="pg-ship__pay-t serif">Напрямую на&nbsp;сайте или&nbsp;в&nbsp;магазине</h3>
        </Reveal>
        <Reveal kind="up" delay={120}>
          <p className="pg-ship__pay-lede">
            Оплата напрямую на&nbsp;сайте через&nbsp;удобные сервисы или&nbsp;в магазине при&nbsp;самовывозе.
          </p>
        </Reveal>
      </section>

      {/* Support */}
      <section className="pg-ship__support">
        <div>
          <Reveal kind="up">
            <div className="eyebrow">&mdash; Техническая поддержка</div>
            <h3 className="pg-ship__sup-t serif">
              С&nbsp;9:00 до&nbsp;21:00<br />мы&nbsp;<em>на&nbsp;связи</em>.
            </h3>
          </Reveal>
        </div>
        <div>
          <Reveal kind="up" delay={120}>
            <p className="pg-ship__sup-p">
              Поможем определиться с&nbsp;выбором, обговорить детали заказа
              и&nbsp;решить любую проблему.
            </p>
            <div className="pg-ship__sup-lks">
              <a href="tel:+79930750577" className="btn btn--filled" data-hover>+7&nbsp;993&nbsp;075&nbsp;05&nbsp;77</a>
              <Link href="/catalog" className="btn" data-hover>Каталог</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="pg-ship__faq">
        <Reveal kind="up">
          <div className="eyebrow">&mdash; Вопросы</div>
          <h3 className="serif">Частые <em style={{ fontStyle: 'italic', color: 'var(--plum)' }}>вопросы</em></h3>
        </Reveal>
        <div className="pg-ship__faq-list">
          {faqs.map((faq, i) => (
            <Reveal key={i} kind="up" delay={i * 80}>
              <details className="pg-ship__faq-item">
                <summary>
                  <span className="serif">{faq.q}</span>
                  <span className="pg-ship__faq-chev">+</span>
                </summary>
                <p>{faq.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
