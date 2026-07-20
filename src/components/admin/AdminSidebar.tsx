'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AdminNavLink from '@/components/admin/AdminNavLink';

const PIN_STORAGE_KEY = 'admin-sidebar-pinned';

type NavChild = { href?: string; label: string; disabled?: boolean; badge?: string };

type NavItem =
  | { kind: 'link'; id: string; href: string; icon: string; label: string }
  | { kind: 'group'; id: string; icon: string; label: string; children: NavChild[] };

// Full sidebar tree — docs/posiflora/admin-map.md §1, mapped onto our routes.
// Two top-level items (Аналитика, Заказы) are plain links; the rest are
// accordion groups with a submenu. Items with no `href` aren't built yet and
// render as inert, disabled rows.
const NAV_ITEMS: NavItem[] = [
  { kind: 'link', id: 'analytics', href: '/admin/retail-stores', icon: 'home', label: 'Аналитика' },
  { kind: 'link', id: 'orders', href: '/admin/orders', icon: 'event', label: 'Заказы' },
  { kind: 'link', id: 'pos', href: '/admin/pos', icon: 'point_of_sale', label: 'Касса (терминал)' },
  {
    kind: 'group', id: 'bouquets', icon: 'local_florist', label: 'Букеты и каталог',
    children: [
      { href: '/admin/showcase', label: 'Букеты в магазине' },
      { href: '/admin/shop-settings', label: 'Онлайн-витрина' },
      { href: '/admin/showcase/analytics', label: 'Аналитика' },
      { href: '/admin/catalog', label: 'Каталог товаров и услуг' },
      { href: '/admin/categories', label: 'Категории' },
      { href: '/admin/specifications', label: 'Рецепты' },
      { href: '/admin/catalog/import', label: 'Импорт' },
    ],
  },
  {
    kind: 'group', id: 'warehouse', icon: 'currency_exchange', label: 'Учёт и финансы',
    children: [
      { href: '/admin/warehouse', label: 'Обзор склада' },
      { href: '/admin/warehouse/analytics', label: 'Аналитика' },
      { href: '/admin/catalog', label: 'Каталог' },
      { href: '/admin/vendors', label: 'Поставщики' },
      { href: '/admin/packing-invoices', label: 'Приходные накладные' },
      { href: '/admin/writeoff-invoices', label: 'Накладные на списание' },
      { href: '/admin/markdown-acts', label: 'Акты уценки' },
      { href: '/admin/sorting-acts', label: 'Акты пересорта' },
      { href: '/admin/inventory-acts', label: 'Акты инвентаризаций' },
      { href: '/admin/movement-acts', label: 'Акты перемещений' },
      { href: '/admin/reports', label: 'Отчёты' },
      { href: '/admin/financial-accounting', label: 'Финансовый учёт' },
      { href: '/admin/exports-list', label: 'Экспорт таблиц' },
    ],
  },
  {
    kind: 'group', id: 'customers', icon: 'group', label: 'Клиенты и развитие',
    children: [
      { href: '/admin/customers', label: 'Список клиентов' },
      { href: '/admin/customers/analytic', label: 'Аналитика' },
      { href: '/admin/customers/import', label: 'Импорт клиентов' },
      { href: '/admin/bonuses', label: 'Система лояльности' },
    ],
  },
  {
    kind: 'group', id: 'staff', icon: 'manage_accounts', label: 'Контроль сотрудников',
    children: [
      { href: '/admin/shifts', label: 'Рабочие смены' },
      { href: '/admin/staff', label: 'Сотрудники' },
      { href: '/admin/roles', label: 'Настройки доступов' },
      { href: '/admin/staff-devices', label: 'Устройства флористов' },
      { label: 'Telegram Бот', disabled: true, badge: 'New' },
    ],
  },
  {
    kind: 'group', id: 'settings', icon: 'settings', label: 'Настройки',
    children: [
      { href: '/admin/order-tags', label: 'Теги заказов' },
      { href: '/admin/recipe-tags', label: 'Теги букетов' },
      { href: '/admin/discount-reasons', label: 'Причины скидок и надбавок' },
      { href: '/admin/customer-celebrations', label: 'Праздничные события' },
      { href: '/admin/customer-preferences', label: 'Предпочтения клиентов' },
      { href: '/admin/customer-sources', label: 'Откуда узнали о нас' },
      { href: '/admin/cash-reasons', label: 'Причины изъятий и внесений' },
      { href: '/admin/customer-deal-sources', label: 'Источники сделок' },
      { href: '/admin/units-of-measure', label: 'Единицы измерения' },
      { href: '/admin/personal-data', label: 'Форма заполнения политики' },
    ],
  },
];

function isPathActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname: string | null, item: Extract<NavItem, { kind: 'group' }>) {
  return item.children.some((child) => child.href && isPathActive(pathname, child.href));
}

export default function AdminSidebar() {
  const pathname = usePathname();

  // Pinned = user fixed the expanded state via the burger; persists across
  // navigation through localStorage. Always start collapsed on the server
  // and on first client render to avoid a hydration mismatch, then sync
  // from localStorage once mounted.
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(PIN_STORAGE_KEY) === '1') setPinned(true);
    } catch {
      // localStorage unavailable (privacy mode, etc.) — stay collapsed.
    }
  }, []);

  // Keep the accordion in sync with the current route: whichever group owns
  // the active page opens automatically (mirrors live Posiflora).
  useEffect(() => {
    const active = NAV_ITEMS.find((item) => item.kind === 'group' && isGroupActive(pathname, item));
    if (active) setOpenGroupId(active.id);
  }, [pathname]);

  const expanded = pinned || hovering;

  const togglePinned = () => {
    setPinned((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore — pin just won't survive a reload this session.
      }
      return next;
    });
  };

  const toggleGroup = (id: string) => {
    // Clicking a group icon while collapsed should reveal it even if the
    // mouseenter that normally drives `hovering` hasn't registered yet
    // (keyboard/touch activation).
    setHovering(true);
    setOpenGroupId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      {/* Reserves layout space equal to the *resting* sidebar width. Hover
          expansion renders on top of this (overlay) without shifting the
          page; pinning grows this spacer so content shifts for real. */}
      <div className="admin-sidebar-spacer" style={{ width: pinned ? 280 : 64 }} />
      <nav
        className={`admin-sidebar ${expanded ? 'admin-sidebar--expanded' : ''}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div className="admin-sidebar__top">
          <Link href="/admin/retail-stores" className="admin-sidebar__logo">
            <span className="admin-sidebar__logo-mark">F</span>
            {expanded && <span className="admin-sidebar__logo-text">Floree</span>}
          </Link>
          {expanded && (
            <button
              type="button"
              className="admin-sidebar__burger"
              onClick={togglePinned}
              aria-label={pinned ? 'Открепить меню' : 'Закрепить меню'}
              aria-pressed={pinned}
              title={pinned ? 'Открепить меню' : 'Закрепить меню'}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
          )}
        </div>

        {expanded && (
          <div className="admin-sidebar__ctas">
            <button type="button" className="admin-sidebar__cta admin-sidebar__cta--primary" disabled title="Скоро">
              Создать новую точку +
            </button>
            <button type="button" className="admin-sidebar__cta admin-sidebar__cta--accent" disabled title="Скоро">
              Увеличить выручку 💰
            </button>
          </div>
        )}

        <div className="admin-sidebar__nav">
          {NAV_ITEMS.map((item) => {
            if (item.kind === 'link') {
              return <AdminNavLink key={item.id} href={item.href} icon={item.icon} label={item.label} expanded={expanded} />;
            }

            const active = isGroupActive(pathname, item);
            const open = expanded && openGroupId === item.id;

            return (
              <div key={item.id} className={`admin-nav-group ${active ? 'admin-nav-group--active' : ''} ${open ? 'admin-nav-group--open' : ''}`}>
                <button
                  type="button"
                  className={`admin-nav-group__btn ${expanded ? 'admin-nav-group__btn--expanded' : ''}`}
                  onClick={() => toggleGroup(item.id)}
                  title={expanded ? undefined : item.label}
                  aria-expanded={open}
                >
                  <span className="material-symbols-outlined admin-nav-link__icon">{item.icon}</span>
                  {expanded && (
                    <>
                      <span className="admin-nav-link__label">{item.label}</span>
                      <span className="material-symbols-outlined admin-nav-group__chevron">chevron_right</span>
                    </>
                  )}
                </button>
                {open && (
                  <div className="admin-nav-group__children">
                    {item.children.map((child) =>
                      child.href ? (
                        <Link
                          key={child.label}
                          href={child.href}
                          className={`admin-nav-subitem ${isPathActive(pathname, child.href) ? 'admin-nav-subitem--active' : ''}`}
                        >
                          {child.label}
                        </Link>
                      ) : (
                        <span key={child.label} className="admin-nav-subitem admin-nav-subitem--disabled" title="Скоро">
                          {child.label}
                          {child.badge && <span className="admin-nav-subitem__badge">{child.badge}</span>}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="admin-sidebar__bottom">
          <span
            className={`admin-nav-link admin-nav-link--disabled ${expanded ? 'admin-nav-link--expanded' : ''}`}
            title="Скоро"
          >
            <span className="material-symbols-outlined admin-nav-link__icon">workspace_premium</span>
            {expanded && <span className="admin-nav-link__label">Управление подпиской</span>}
          </span>
          {/* Logout is a GET route handler; use a plain anchor (not <Link>) so it
              is never prefetched — a prefetch would silently log the user out. */}
          <a
            href="/admin/logout"
            className={`admin-nav-link admin-nav-link--logout ${expanded ? 'admin-nav-link--expanded' : ''}`}
            title={expanded ? undefined : 'Выйти из системы'}
          >
            <span className="material-symbols-outlined admin-nav-link__icon">logout</span>
            {expanded && <span className="admin-nav-link__label">Выйти из системы</span>}
          </a>
        </div>
      </nav>
    </>
  );
}
