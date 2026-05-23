import type { Metadata } from 'next';
import Link from 'next/link';
import HeroCarousel from '@/components/HeroCarousel';
import Reveal from '@/components/Reveal';
import MaskImage from '@/components/MaskImage';
import Ticker from '@/components/Ticker';

export const metadata: Metadata = {
  title: 'Floree — цветочная студия в Санкт-Петербурге | Купить букет с доставкой',
  description: 'Флористическая студия Floree в Санкт-Петербурге. Авторские букеты с доставкой по СПб за 2 часа. Свежие цветы, индивидуальный подход. Полтавский проезд, 2, м. Площадь Восстания.',
  openGraph: {
    title: 'Floree — цветочная студия в Санкт-Петербурге',
    description: 'Авторские букеты с доставкой по СПб за 2 часа. Свежие цветы, индивидуальный подход.',
    url: 'https://floree.ru',
    type: 'website',
  },
};

export default async function HomePage() {
  return (
    <div style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      {/* HERO */}
      <HeroCarousel />

      {/* INTRO */}
      <section className="ed-intro">
        <Reveal kind="up">
          <div className="eyebrow" style={{ marginBottom: 24 }}>&mdash; Floree</div>
        </Reveal>
        <Reveal kind="up" delay={120}>
          <p className="ed-intro__lede serif">
            Floree&nbsp;&mdash; это всегда чуть&nbsp;<em>больше</em>,<br />
            чем вы&nbsp;ожидаете.
          </p>
        </Reveal>
      </section>

      {/* TICKER */}
      <Ticker items={['Цветы дня', 'Свадебная флористика', 'Подписка', 'Корпоративные заказы', 'Доставка по СПб']} speed={22} />

      {/* STORY — Почему выбирают нас? */}
      <section className="ed-story" id="about">
        <div className="ed-story__media">
          <MaskImage
            src="https://images.unsplash.com/photo-1487700160041-babef9c3cb55?w=1400&q=80&auto=format&fit=crop"
            alt="Студия Floree"
            aspect="4/5"
          />
          <div className="ed-story__caption mono">
            &darr; Полтавский проезд, 2 &middot; мастерская
          </div>
        </div>
        <div className="ed-story__copy">
          <Reveal kind="up">
            <div className="eyebrow">&mdash; О нас</div>
          </Reveal>
          <Reveal kind="up" delay={120}>
            <h2 className="ed-story__title">
              Почему<br />выбирают <em>нас?</em>
            </h2>
          </Reveal>
          <Reveal kind="up" delay={220}>
            <ul className="ed-story__bullets">
              <li>
                Floree&nbsp;&mdash; это уверенность в&nbsp;том, что ваши любимые
                и&nbsp;близкие получат стильный, качественный букет,
                собранный с&nbsp;любовью.
              </li>
              <li>Floree&nbsp;&mdash; это всегда свежие цветы!</li>
              <li>
                Floree&nbsp;&mdash; это удобно, быстро и&nbsp;с&nbsp;индивидуальным
                подходом.
              </li>
            </ul>
          </Reveal>
          <Reveal kind="up" delay={320}>
            <Link href="/catalog" className="btn" data-hover style={{ marginTop: 32 }}>
              Смотреть каталог
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor"/></svg>
            </Link>
          </Reveal>
        </div>
      </section>


      {/* REVIEWS */}
      <section className="ed-reviews">
        <Reveal kind="up">
          <div className="eyebrow" style={{ textAlign: 'center' }}>&mdash; Отзывы</div>
          <h2 className="ed-reviews__title">Отзывы о&nbsp;нашей студии</h2>
        </Reveal>
        <div className="ed-reviews__grid">
          {[
            {
              name: 'Даниил',
              src: 'Яндекс Карты',
              text: 'Я был просто в восторге от букета, который заказал в этом сервисе! Цветы были настолько свежие и красивые, словно только что с грядки. Аромат стоял на всю комнату! Композиция была собрана со вкусом и выглядела даже лучше, чем на фотографии на сайте. Однозначно рекомендую, если хотите порадовать близких по-настоящему!',
            },
            {
              name: 'София',
              src: 'Instagram',
              text: 'Заказывала букет для мамы на День рождения, находясь в другом городе. Очень переживала, что доставка задержится или букет будет выглядеть неважно. Но всё прошло идеально! Заказ оформила онлайн быстро и легко, оплатила тоже без проблем. Курьер приехал точно в указанное время, позвонил заранее. Мама была в восторге от цветов! Спасибо за отличный сервис и спокойствие!',
            },
            {
              name: 'Анастасия',
              src: 'Яндекс Карты',
              text: 'В процессе оформления заказа возникла небольшая проблема с выбором времени доставки, но сотрудники сервиса очень быстро отреагировали и предложили оптимальное решение. Было приятно видеть такую клиентоориентированность и готовность помочь. Букет доставили вовремя, он был очень красивым и соответствовал моим ожиданиям. Чувствуется, что компания заботится о своей репутации и делает всё для удовлетворения клиентов.',
            },
          ].map((r, i) => (
            <Reveal key={i} kind="up" delay={i * 120}>
              <figure className="ed-review">
                <blockquote className="ed-review__text">«{r.text}»</blockquote>
                <figcaption className="ed-review__meta">
                  <span className="ed-review__name serif">{r.name}</span>
                  <span className="ed-review__src mono">Источник: {r.src}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CONTACTS */}
      <section id="contacts" className="home-contacts" style={{ maxWidth: 1500, margin: '0 auto' }}>
        <Reveal kind="up">
          <div className="eyebrow">&mdash; Цветочная студия</div>
          <h2 className="serif" style={{ fontSize: 'clamp(48px, 5.5vw, 88px)', margin: '16px 0', fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em' }}>
            Полтавский проезд, <em style={{ fontStyle: 'italic', color: 'var(--plum)' }}>2</em>
          </h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 17, maxWidth: '50ch', margin: '0 0 16px' }}>
            Санкт-Петербург, м.&nbsp;Площадь Восстания. Ежедневно 09:00&nbsp;&mdash; 21:00.
          </p>
          <p style={{ color: 'var(--ink-2)', fontSize: 17, maxWidth: '50ch', margin: '0 0 40px' }}>
            Связаться с&nbsp;нами: <a href="tel:+79930750577" data-hover style={{ color: 'inherit' }}>+7&nbsp;(993)&nbsp;075-05-77</a>
          </p>
        </Reveal>
        <Reveal kind="fade" delay={120}>
          <div className="contacts-map" style={{ position: 'relative', overflow: 'hidden', background: 'var(--bone)', border: '1px solid var(--line)' }}>
            <iframe
              src="https://yandex.ru/map-widget/v1/-/CPcJFGm~"
              title="Floree на Яндекс Картах"
              width="100%"
              height="100%"
              style={{ border: 0, display: 'block', filter: 'grayscale(0.2)' }}
              loading="lazy"
              allowFullScreen
            />
            <div className="mono" style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              background: 'var(--paper)', padding: '14px 24px',
              display: 'flex', justifyContent: 'space-between', gap: 16,
              fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.08em',
              borderTop: '1px solid var(--line)'
            }}>
              <span>Данные Яндекс Карт</span>
              <a href="https://yandex.ru/maps/-/CPcJFGm~" target="_blank" rel="noopener" data-hover style={{ color: 'var(--ink-3)', textDecoration: 'none' }}>
                Открыть в Яндекс Картах &rarr;
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="ed-cta">
        <Reveal kind="up">
          <div className="ed-cta__inner">
            <h2 className="ed-cta__t">
              Хотите букет<br />
              <em>не&nbsp;как у&nbsp;всех?</em>
            </h2>
            <p className="ed-cta__p">
              Напишите нам&nbsp;&mdash; обсудим повод, цвет и&nbsp;настроение.
              Соберём что-то ваше.
            </p>
            <a href="tel:+79930750577" className="btn btn--filled" data-hover style={{ borderColor: 'var(--paper)', background: 'var(--paper)', color: 'var(--ink)' }}>
              +7 993 075 05 77
            </a>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
