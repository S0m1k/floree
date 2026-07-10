import type { Metadata } from 'next';
import Link from 'next/link';
import HeroCarousel from '@/components/HeroCarousel';
import Reveal from '@/components/Reveal';
import MaskImage from '@/components/MaskImage';
import Ticker from '@/components/Ticker';
import RecipeCard from '@/components/RecipeCard';
import { Recipe, RecipeCategory } from '@/types';

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

const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Shown only when the backend returns no categories (dev / API down).
const FALLBACK_CATEGORIES = [
  'Сезонные',
  'Монобукеты',
  'Сборные букеты',
  'Гигант букеты',
  'Охапки',
  'Свадебная флористика',
];

async function getCategories(): Promise<RecipeCategory[]> {
  try {
    const res = await fetch(`${API_URL}/api/recipe-categories`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

async function getRecipes(): Promise<Recipe[]> {
  try {
    const res = await fetch(`${API_URL}/api/recipes`, { next: { revalidate: 120 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [categories, recipes] = await Promise.all([getCategories(), getRecipes()]);
  const popular = recipes.slice(0, 10);

  return (
    <div style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      {/* HERO — фото + панель (заказ / соцсети) */}
      <HeroCarousel />

      {/* КАТЕГОРИИ — активные кнопки под фото */}
      <section className="home-cats" aria-label="Категории букетов">
        <Reveal kind="up">
          <div className="home-cats__row">
            {categories.length > 0
              ? categories.map((c) => (
                  <Link
                    key={c.id}
                    href={`/catalog?category=${encodeURIComponent(c.id)}`}
                    className="cat-pill display"
                    data-hover
                  >
                    {c.attributes.title}
                  </Link>
                ))
              : FALLBACK_CATEGORIES.map((title) => (
                  <Link key={title} href="/catalog" className="cat-pill display" data-hover>
                    {title}
                  </Link>
                ))}
          </div>
        </Reveal>
        <Reveal kind="up" delay={120}>
          <Link href="/catalog" className="btn btn--filled home-cats__all" data-hover>
            Смотреть каталог
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor"/></svg>
          </Link>
        </Reveal>
      </section>

      {/* ЯКОРНАЯ НАВИГАЦИЯ по разделам */}
      <nav className="home-subnav" aria-label="Разделы страницы">
        <a href="#about" data-hover>О нас</a>
        <span className="home-subnav__dot">·</span>
        <a href="#popular" data-hover>Популярные букеты</a>
        <span className="home-subnav__dot">·</span>
        <a href="#reviews" data-hover>Отзывы</a>
        <span className="home-subnav__dot">·</span>
        <a href="#contacts" data-hover>Контакты</a>
      </nav>

      {/* О НАС */}
      <section className="ed-story" id="about">
        <div className="ed-story__media">
          <MaskImage
            src="https://images.unsplash.com/photo-1487700160041-babef9c3cb55?w=1400&q=80&auto=format&fit=crop"
            alt="Цветочная студия Floree"
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
            <h2 className="ed-story__title display">
              Уютная студия<br />в&nbsp;центре <em>города</em>
            </h2>
          </Reveal>
          <Reveal kind="up" delay={200}>
            <p className="ed-story__lede">
              Floree&nbsp;&mdash; это уютная цветочная студия в&nbsp;центре города, где мы&nbsp;всегда
              встретим вас с&nbsp;улыбкой и&nbsp;поможем с&nbsp;выбором «того&nbsp;самого» букета.
              Завоевать ваше доверие&nbsp;&mdash; наша главная задача.
            </p>
          </Reveal>
          <Reveal kind="up" delay={280}>
            <p className="ed-story__sub display">Что мы для этого делаем?</p>
            <ul className="ed-story__bullets">
              <li>Сотрудничаем с&nbsp;проверенными поставщиками и&nbsp;выбираем только качественные цветы.</li>
              <li>Внимательно фиксируем все детали и&nbsp;пожелания, а&nbsp;перед отправкой присылаем фото букета для согласования.</li>
              <li>Отправляем букет на&nbsp;воде (аквапак / аквабокс) и&nbsp;в&nbsp;транспортировочной коробке.</li>
              <li>К&nbsp;букету крепим конверт с&nbsp;инструкцией по&nbsp;уходу и&nbsp;кризал.</li>
              <li>Можем адаптировать букет из&nbsp;каталога под ваш бюджет или предложим достойную альтернативу.</li>
              <li>Дарим кэшбэк баллами с&nbsp;каждого заказа&nbsp;&mdash; 1&nbsp;балл&nbsp;=&nbsp;1&nbsp;&#8381;.</li>
            </ul>
          </Reveal>
          <Reveal kind="up" delay={360}>
            <Link href="/catalog" className="btn" data-hover style={{ marginTop: 32 }}>
              Смотреть каталог
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor"/></svg>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* TICKER — живой разделитель */}
      <Ticker items={['Цветы дня', 'Свадебная флористика', 'Подписка', 'Корпоративные заказы', 'Доставка по СПб']} speed={22} />

      {/* ПОПУЛЯРНЫЕ БУКЕТЫ — боковая лента */}
      {popular.length > 0 && (
        <section id="popular" className="home-popular">
          <div className="home-popular__head">
            <Reveal kind="up">
              <div className="eyebrow">&mdash; Каталог</div>
              <h2 className="home-popular__title display">Популярные букеты</h2>
            </Reveal>
            <Reveal kind="fade" delay={120}>
              <Link href="/catalog" className="ed-catalog__all" data-hover>
                Весь каталог
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor"/></svg>
              </Link>
            </Reveal>
          </div>
          <div className="pop-ribbon" role="list">
            {popular.map((r, i) => (
              <div className="pop-ribbon__item" role="listitem" key={r.id}>
                <RecipeCard recipe={r} index={i} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* КАК НАС НАЙТИ — Яндекс карта */}
      <section id="contacts" className="home-contacts" style={{ maxWidth: 1500, margin: '0 auto' }}>
        <Reveal kind="up">
          <div className="eyebrow">&mdash; Как нас найти</div>
          <h2 className="display" style={{ fontSize: 'clamp(44px, 5.5vw, 84px)', margin: '16px 0', lineHeight: 1 }}>
            Полтавский проезд,&nbsp;<em style={{ fontStyle: 'normal', color: 'var(--plum)' }}>2</em>
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

      {/* ОТЗЫВЫ — лента */}
      <section id="reviews" className="ed-reviews">
        <Reveal kind="up">
          <div className="eyebrow" style={{ textAlign: 'center' }}>&mdash; Отзывы</div>
          <h2 className="ed-reviews__title display">Отзывы о&nbsp;нашей студии</h2>
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
              text: 'В процессе оформления заказа возникла небольшая проблема с выбором времени доставки, но сотрудники сервиса очень быстро отреагировали и предложили оптимальное решение. Было приятно видеть такую клиентоориентированность и готовность помочь. Букет доставили вовремя, он был очень красивым и соответствовал моим ожиданиям. Чувствуется, что компания заботится о своей репутации.',
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

      {/* CTA */}
      <section className="ed-cta">
        <Reveal kind="up">
          <div className="ed-cta__inner">
            <h2 className="ed-cta__t display">
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
