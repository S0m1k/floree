import Link from 'next/link';
import HeroCarousel from '@/components/HeroCarousel';
import Reveal from '@/components/Reveal';
import MaskImage from '@/components/MaskImage';
import Ticker from '@/components/Ticker';

export default async function HomePage() {
  return (
    <div style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      {/* HERO */}
      <HeroCarousel />

      {/* INTRO */}
      <section className="ed-intro">
        <Reveal kind="up">
          <div className="eyebrow" style={{ marginBottom: 24 }}>&mdash; Манифест</div>
        </Reveal>
        <Reveal kind="up" delay={120}>
          <p className="ed-intro__lede serif">
            Мы&nbsp;&mdash; небольшая студия в&nbsp;центре Петербурга. Каждое&nbsp;утро встречаем новый завоз
            из&nbsp;Голландии, выбираем самые тонкие, самые живые цветы&nbsp;&mdash; и&nbsp;собираем
            из&nbsp;них то, что хочется держать в&nbsp;руках.
          </p>
        </Reveal>
      </section>

      {/* TICKER */}
      <Ticker items={['Цветы дня', 'Свадебная флористика', 'Подписка', 'Корпоративные заказы', 'Доставка по СПб']} speed={22} />

      {/* STORY */}
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
            <div className="eyebrow">&mdash; О студии</div>
          </Reveal>
          <Reveal kind="up" delay={120}>
            <h3 className="ed-story__title">
              Тишина мастерской<br />и&nbsp;звук <em>секатора</em>.
            </h3>
          </Reveal>
          <Reveal kind="up" delay={220}>
            <p className="ed-story__text">
              Floree&nbsp;&mdash; это небольшая мастерская и&nbsp;тысячи стеблей,
              проходящих через наши руки за&nbsp;год. Мы&nbsp;работаем с&nbsp;цветами так,
              как нам бы&nbsp;самим хотелось их&nbsp;получить&nbsp;&mdash; без&nbsp;лишнего, без&nbsp;надрыва,
              с&nbsp;вниманием к&nbsp;каждому стеблю.
            </p>
          </Reveal>
          <Reveal kind="up" delay={320}>
            <Link href="/catalog" className="btn" data-hover style={{ marginTop: 32 }}>
              Смотреть каталог
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor"/></svg>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="ed-cats">
        <Reveal kind="up">
          <div className="eyebrow" style={{ textAlign: 'center' }}>&mdash; Что мы делаем</div>
          <h2 className="ed-cats__title">Три направления студии</h2>
        </Reveal>
        <div className="ed-cats__row">
          {[
            { t: 'Авторские букеты', sub: 'Каждый день — свежие композиции от флористов студии', img: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1400&q=80&auto=format&fit=crop', n: '01' },
            { t: 'Свадебная флористика', sub: 'От букета невесты до арки и оформления зала', img: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=1400&q=80&auto=format&fit=crop', n: '02' },
            { t: 'Подписка на цветы', sub: 'Свежие букеты домой каждую неделю или раз в две', img: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=1400&q=80&auto=format&fit=crop', n: '03' },
          ].map((c, i) => (
            <Reveal key={i} kind="up" delay={i * 120}>
              <div className="ed-cat__media" data-hover>
                <MaskImage src={c.img} alt={c.t} aspect="3/4" delay={i * 100} />
              </div>
              <div className="ed-cat__meta">
                <span className="ed-cat__n">N&deg;{c.n}</span>
                <h4 className="ed-cat__t">{c.t}</h4>
                <p className="ed-cat__sub">{c.sub}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* QUOTE */}
      <section className="ed-quote">
        <Reveal kind="fade">
          <blockquote className="ed-quote__text serif">
            &laquo;Цветок&nbsp;&mdash; это <em>письмо</em>, которое не нужно читать.<br />
            Достаточно держать в&nbsp;руках.&raquo;
          </blockquote>
        </Reveal>
        <Reveal kind="up" delay={300}>
          <div className="eyebrow">&mdash; Floree</div>
        </Reveal>
      </section>

      {/* CONTACTS */}
      <section id="contacts" style={{ padding: '120px 56px', maxWidth: 1500, margin: '0 auto' }}>
        <Reveal kind="up">
          <div className="eyebrow">&mdash; Контакты</div>
          <h2 className="serif" style={{ fontSize: 'clamp(48px, 5.5vw, 88px)', margin: '16px 0', fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em' }}>
            Полтавский проезд, <em style={{ fontStyle: 'italic', color: 'var(--plum)' }}>2</em>
          </h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 17, maxWidth: '50ch', margin: '0 0 40px' }}>
            Санкт-Петербург, м.&nbsp;Площадь Восстания&nbsp;&mdash; 4&nbsp;минуты пешком. Ежедневно 09:00&nbsp;&mdash; 21:00.
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
            <h3 className="ed-cta__t">
              Хотите букет<br />
              <em>не&nbsp;как у&nbsp;всех?</em>
            </h3>
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
