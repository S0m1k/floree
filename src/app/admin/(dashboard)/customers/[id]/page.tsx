import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getCustomer, getCustomerStats, getCustomerSpend, getCustomerBonusHistory,
} from '@/lib/adminCustomers';
import { getBonusGroups, getCustomerBonusGroupHistory } from '@/lib/adminLoyalty';
import { getOrders, getWorkers } from '@/lib/adminOrders';
import { AdminBonusGroup, AdminCustomer, AdminCustomerStats, Worker } from '@/types';
import CustomerActionsMenu from '@/components/admin/CustomerActionsMenu';
import BonusBalanceEditor from '@/components/admin/BonusBalanceEditor';
import BonusGroupSelector from '@/components/admin/BonusGroupSelector';
import OrderStatusBadge from '@/components/admin/OrderStatusBadge';

export const metadata = { title: 'Клиент' };

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

const fmtDateLong = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');
};

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Русская плюрализация: plural(3, ['день','дня','дней']) → 'дня'.
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// «Клиент: 9 МЕСЯЦЕВ» — стаж от первого заказа (или регистрации).
function tenure(sinceIso: string | null): { value: string; label: string } {
  if (!sinceIso) return { value: '—', label: '' };
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) return { value: '—', label: '' };
  const now = new Date();
  let months = (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth());
  if (now.getDate() < since.getDate()) months -= 1;
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return { value: String(years), label: plural(years, ['ГОД', 'ГОДА', 'ЛЕТ']) };
  }
  if (months >= 1) {
    return { value: String(months), label: plural(months, ['МЕСЯЦ', 'МЕСЯЦА', 'МЕСЯЦЕВ']) };
  }
  const days = Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
  return { value: String(days), label: plural(days, ['ДЕНЬ', 'ДНЯ', 'ДНЕЙ']) };
}

function daysAgo(iso: string | null): { value: string; label: string } {
  if (!iso) return { value: '—', label: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { value: '—', label: '' };
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY_MS));
  return { value: String(days), label: `${plural(days, ['ДЕНЬ', 'ДНЯ', 'ДНЕЙ'])} НАЗАД` };
}

const GENDER_LABELS: Record<string, string> = { male: 'Мужской', female: 'Женский', other: 'Не указан' };

const TABS = [
  { key: 'info', label: 'Общая информация' },
  { key: 'spend', label: 'Траты' },
  { key: 'orders', label: 'Заказы' },
  { key: 'bonuses', label: 'Бонусы' },
  { key: 'discounts', label: 'Скидочные группы' },
  { key: 'florist-calendar', label: 'Календарь флориста' },
  { key: 'events-calendar', label: 'Календарь событий' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface Props {
  params: { id: string };
  searchParams: { tab?: string; from?: string; to?: string; page?: string };
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ---------- Вкладка «Общая информация» ----------

function InfoTab({
  customer, stats, bonusGroupTitle,
}: {
  customer: AdminCustomer;
  stats: AdminCustomerStats | null;
  bonusGroupTitle: string | null;
}) {
  const a = customer.attributes;
  const phoneDigits = a.phone.replace(/\D/g, '');
  const clientSince = stats?.firstOrderAt || a.createdAt;
  const t = tenure(clientSince);
  const last = daysAgo(stats?.lastOrderAt ?? null);

  return (
    <div className="admin-customer-info">
      <section className="admin-panel">
        <p className="admin-panel__title">Контакты</p>
        <div className="admin-field">
          <label>Телефон</label>
          <div className="admin-contact-row">
            <span>{a.phone}</span>
            <a
              className="admin-contact-icon admin-contact-icon--wa"
              href={`https://wa.me/${phoneDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Написать в WhatsApp"
              title="WhatsApp"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a13 13 0 0 1-1.5-.5 11.5 11.5 0 0 1-4.4-3.9c-.3-.5-.8-1.3-.8-2.2 0-.9.5-1.3.6-1.5.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4l.7 1.7c0 .1.1.3 0 .4l-.3.5-.4.4c-.1.1-.2.2-.1.5.1.2.6 1 1.3 1.6a6 6 0 0 0 1.9 1.2c.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.5-.1l1.6.7c.2.1.4.2.4.3.1.1.1.5-.1 1Z" />
              </svg>
            </a>
            <a
              className="admin-contact-icon admin-contact-icon--tg"
              href={`https://t.me/+${phoneDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Написать в Telegram"
              title="Telegram"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
                <path d="M21.9 3.4 2.7 10.8c-1 .4-1 1.4-.2 1.7l4.9 1.5 1.9 5.8c.2.7 1 .9 1.5.4l2.7-2.6 5 3.7c.7.4 1.6 0 1.8-.9l3-15.5c.2-1-.6-1.8-1.4-1.5ZM8.5 13.5l9.4-6c.4-.3.8.3.5.6l-7.6 7-.3 3-2-4.6Z" />
              </svg>
            </a>
          </div>
        </div>
        <div className="admin-field">
          <label>Пол</label>
          <span>{GENDER_LABELS[a.gender] || 'Не указан'}</span>
        </div>
        <div className="admin-field" style={{ paddingBottom: 16 }}>
          <label>Тип клиента</label>
          <span>{a.customerType === 'company' ? 'Юридическое лицо' : 'Физическое лицо'}</span>
        </div>
      </section>

      <div className="admin-stat-grid">
        <div className="admin-stat-tile">
          <div className="admin-stat-tile__title">Клиент</div>
          <div className="admin-stat-tile__value admin-stat-tile__value--green">
            {t.value} <span className="admin-stat-tile__unit">{t.label}</span>
          </div>
          <div className="admin-stat-tile__footer">
            {clientSince ? `с ${fmtDateLong(clientSince)}` : '—'}
          </div>
        </div>

        <div className="admin-stat-tile">
          <div className="admin-stat-tile__title">Последний заказ</div>
          <div className="admin-stat-tile__value admin-stat-tile__value--red">
            {last.value} <span className="admin-stat-tile__unit">{last.label}</span>
          </div>
          <div className="admin-stat-tile__footer">
            {stats?.lastOrderAt ? `Дата заказа: ${fmtDateLong(stats.lastOrderAt)}` : 'Заказов ещё не было'}
          </div>
        </div>

        <div className="admin-stat-tile">
          <div className="admin-stat-tile__title">Средний чек</div>
          <div className="admin-stat-tile__value admin-stat-tile__value--orange">
            {stats ? fmtMoney(stats.avgCheck) : '—'}
          </div>
          <div className="admin-stat-tile__footer" />
        </div>

        <div className="admin-stat-tile">
          <div className="admin-stat-tile__title">Заказов</div>
          <div className="admin-stat-tile__value admin-stat-tile__value--blue">
            {stats ? stats.ordersCount : '—'}
          </div>
          <div className="admin-stat-tile__footer" />
        </div>

        <div className="admin-stat-tile">
          <div className="admin-stat-tile__title">Сумма заказов</div>
          <div className="admin-stat-tile__value admin-stat-tile__value--purple">
            {stats ? fmtMoney(stats.ordersTotal) : '—'}
          </div>
          <div className="admin-stat-tile__footer" />
        </div>

        <div className="admin-stat-tile">
          <div className="admin-stat-tile__title">Бонусы</div>
          <div className="admin-stat-tile__value admin-stat-tile__value--blue">{a.currentPoints}</div>
          <div className="admin-stat-tile__footer">Бонусная группа: {bonusGroupTitle || '—'}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- Вкладка «Траты» ----------

async function SpendTab({ customerId, from, to }: { customerId: string; from: string; to: string }) {
  const spend = await getCustomerSpend(customerId, from, to);
  const byDay: Record<string, number> = Object.fromEntries(
    (spend?.days || []).map((d) => [d.date, d.amount]),
  );

  // Полный ряд дней периода — дни без заказов рисуются нулевыми барами.
  const days: { date: string; amount: number }[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let d = new Date(start); d <= end && days.length < 92; d.setDate(d.getDate() + 1)) {
    const key = isoDate(d);
    days.push({ date: key, amount: byDay[key] || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.amount));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <form method="GET" action={`/admin/customers/${customerId}`} className="admin-period-picker">
        <input type="hidden" name="tab" value="spend" />
        <div className="admin-field" style={{ padding: 0 }}>
          <label htmlFor="from">С</label>
          <input type="date" id="from" name="from" defaultValue={from} />
        </div>
        <div className="admin-field" style={{ padding: 0 }}>
          <label htmlFor="to">По</label>
          <input type="date" id="to" name="to" defaultValue={to} />
        </div>
        <button type="submit" className="admin-btn admin-btn--primary">Показать</button>
      </form>

      <section className="admin-panel">
        <p className="admin-panel__title">Траты клиента</p>
        {spend && spend.total > 0 ? (
          <div style={{ padding: '16px' }}>
            <div className="admin-bar-chart" role="img" aria-label="Траты клиента по дням">
              {days.map((d) => (
                <div key={d.date} className="admin-bar-chart__col" title={`${fmtDateLong(d.date)}: ${fmtMoney(d.amount)}`}>
                  <div
                    className="admin-bar-chart__bar"
                    style={{ height: `${Math.round((d.amount / max) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="admin-bar-chart__axis">
              <span>{fmtDateLong(from)}</span>
              <span>Итого за период: {fmtMoney(spend.total)}</span>
              <span>{fmtDateLong(to)}</span>
            </div>
          </div>
        ) : (
          <div className="admin-empty">За выбранный период трат нет.</div>
        )}
      </section>
    </div>
  );
}

// ---------- Вкладка «Заказы» ----------

async function OrdersTab({ customerId, page }: { customerId: string; page?: string }) {
  const [{ orders, total }, workers] = await Promise.all([
    getOrders({ customer: customerId, page }),
    getWorkers(),
  ]);
  const workersById: Record<string, Worker> = Object.fromEntries(workers.map((w) => [w.id, w]));

  if (orders.length === 0) {
    return (
      <div className="admin-table-wrap">
        <div className="admin-empty">У клиента пока нет заказов.</div>
      </div>
    );
  }

  const current = Math.max(1, parseInt(page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Статус</th>
            <th>Дата/время создания</th>
            <th>Автор заказа</th>
            <th>Дата/время завершения</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const a = o.attributes;
            const createdById = o.relationships?.createdBy?.data?.id;
            const author = createdById ? workersById[createdById]?.attributes.name : null;
            return (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.id}`}>{a.docNo || o.id.slice(0, 8)}</Link></td>
                <td><OrderStatusBadge status={a.status} variant="text" /></td>
                <td>{fmtDateTime(a.createdAt)}</td>
                <td>{author || '—'}</td>
                <td>{fmtDateTime(a.closedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="admin-pagination">
        <span>Найдено заказов: {total}</span>
        <div className="admin-pagination__pages">
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pageCount || Math.abs(p - current) <= 2)
            .map((p) => (
              p === current ? (
                <span key={p} className="admin-pagination__current">{p}</span>
              ) : (
                <Link key={p} href={`/admin/customers/${customerId}?tab=orders&page=${p}`}>{p}</Link>
              )
            ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Вкладка «Бонусы» ----------

async function BonusesTab({
  customer, from, to, workersById, groups, groupsById,
}: {
  customer: AdminCustomer;
  from?: string;
  to?: string;
  workersById: Record<string, Worker>;
  groups: AdminBonusGroup[];
  groupsById: Record<string, AdminBonusGroup>;
}) {
  const [history, groupHistory] = await Promise.all([
    getCustomerBonusHistory(customer.id, from, to),
    getCustomerBonusGroupHistory(customer.id),
  ]);
  const currentGroupId = customer.relationships?.bonusGroup?.data?.id || null;
  const groupTitle = (id: string | null | undefined) => (id ? groupsById[id]?.attributes.title || '—' : '—');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="admin-panel">
        <p className="admin-panel__title">Лояльность</p>
        <div className="admin-field">
          <label>Бонусная группа</label>
          <BonusGroupSelector customerId={customer.id} groups={groups} currentGroupId={currentGroupId} />
        </div>
        <div className="admin-field" style={{ paddingBottom: 16 }}>
          <label>Бонусы</label>
          <BonusBalanceEditor customerId={customer.id} balance={customer.attributes.currentPoints} />
        </div>
      </section>

      <section className="admin-panel">
        <p className="admin-panel__title">История изменения бонусных групп</p>
        <div className="admin-table-wrap" style={{ border: 'none', margin: '10px 16px 16px', width: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr><th>Дата</th><th>Автор изменений</th><th>Старая бонусная группа</th><th>Новая бонусная группа</th></tr>
            </thead>
            <tbody>
              {groupHistory.length === 0 ? (
                <tr><td colSpan={4} className="admin-empty" style={{ padding: 24 }}>Изменений бонусных групп пока нет.</td></tr>
              ) : (
                groupHistory.map((h) => {
                  const workerId = h.relationships?.worker?.data?.id;
                  const worker = workerId ? workersById[workerId] : null;
                  return (
                    <tr key={h.id}>
                      <td>{fmtDateTime(h.attributes.changedAt)}</td>
                      <td>{h.attributes.isAutomatic ? 'автоматически' : worker?.attributes.name || '—'}</td>
                      <td>{groupTitle(h.relationships?.oldGroup?.data?.id)}</td>
                      <td>{groupTitle(h.relationships?.newGroup?.data?.id)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel">
        <p className="admin-panel__title">История списаний и начислений бонусов</p>
        <form method="GET" action={`/admin/customers/${customer.id}`} className="admin-period-picker" style={{ padding: '10px 16px 0' }}>
          <input type="hidden" name="tab" value="bonuses" />
          <div className="admin-field" style={{ padding: 0 }}>
            <label htmlFor="bonusFrom">С</label>
            <input type="date" id="bonusFrom" name="from" defaultValue={from || ''} />
          </div>
          <div className="admin-field" style={{ padding: 0 }}>
            <label htmlFor="bonusTo">По</label>
            <input type="date" id="bonusTo" name="to" defaultValue={to || ''} />
          </div>
          <button type="submit" className="admin-btn admin-btn--primary">Показать</button>
        </form>
        {history.length === 0 ? (
          <div className="admin-empty">Списаний и начислений пока нет.</div>
        ) : (
          <div className="admin-table-wrap" style={{ border: 'none', margin: '10px 16px 16px', width: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr><th>Дата</th><th>Сумма</th><th>Комментарий</th><th>Автор</th></tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const workerId = h.relationships?.worker?.data?.id;
                  const worker = workerId ? workersById[workerId] : null;
                  return (
                    <tr key={h.id}>
                      <td>{fmtDateTime(h.attributes.createdAt)}</td>
                      <td style={{ color: h.attributes.amount < 0 ? '#B3261E' : 'var(--admin-accent-outline)', fontWeight: 600 }}>
                        {h.attributes.amount > 0 ? `+${h.attributes.amount}` : h.attributes.amount}
                      </td>
                      <td>{h.attributes.comment || '—'}</td>
                      <td>{worker?.attributes.name || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Страница ----------

export default async function AdminCustomerDetailPage({ params, searchParams }: Props) {
  const customer = await getCustomer(params.id);
  if (!customer) notFound();

  const tab: TabKey = (TABS.find((t) => t.key === searchParams.tab)?.key || 'info') as TabKey;

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const spendFrom = searchParams.from || isoDate(monthStart);
  const spendTo = searchParams.to || isoDate(today);

  // stats/workers нужны только на «Общей информации»/«Бонусах»; bonus-group
  // titles нужны на обеих (плитка «Бонусы» + вкладка «Бонусы»), это дешёвый
  // справочник, поэтому просто грузим его всегда.
  const stats = tab === 'info' ? await getCustomerStats(customer.id) : null;
  const workers = tab === 'bonuses' ? await getWorkers() : [];
  const workersById: Record<string, Worker> = Object.fromEntries(workers.map((w) => [w.id, w]));
  const bonusGroups = await getBonusGroups();
  const bonusGroupsById: Record<string, AdminBonusGroup> = Object.fromEntries(
    bonusGroups.map((g) => [g.id, g]),
  );
  const currentBonusGroupId = customer.relationships?.bonusGroup?.data?.id || null;
  const bonusGroupTitle = currentBonusGroupId
    ? bonusGroupsById[currentBonusGroupId]?.attributes.title || null
    : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/customers" className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0, flex: 1 }}>
          {customer.attributes.title || 'Без имени'}
        </h1>
        <CustomerActionsMenu editHref={`/admin/customers/${customer.id}/edit`} />
      </div>

      <nav className="admin-tabs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'info' ? `/admin/customers/${customer.id}` : `/admin/customers/${customer.id}?tab=${t.key}`}
            className={`admin-tab ${tab === t.key ? 'admin-tab--active' : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'info' && <InfoTab customer={customer} stats={stats} bonusGroupTitle={bonusGroupTitle} />}
      {tab === 'spend' && <SpendTab customerId={customer.id} from={spendFrom} to={spendTo} />}
      {tab === 'orders' && <OrdersTab customerId={customer.id} page={searchParams.page} />}
      {tab === 'bonuses' && (
        <BonusesTab
          customer={customer}
          from={searchParams.from}
          to={searchParams.to}
          workersById={workersById}
          groups={bonusGroups}
          groupsById={bonusGroupsById}
        />
      )}
      {(tab === 'discounts' || tab === 'florist-calendar' || tab === 'events-calendar') && (
        <div className="admin-table-wrap">
          <div className="admin-empty">Нет данных</div>
        </div>
      )}
    </div>
  );
}
