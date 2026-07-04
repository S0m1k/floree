import { OrdersSearchParams } from '@/lib/adminOrders';
import { SimpleDictEntry, Worker } from '@/types';

interface Props {
  current: OrdersSearchParams;
  stores: SimpleDictEntry[];
  sources: SimpleDictEntry[];
  workers: Worker[];
}

function WorkerSelect({ name, label, workers, value }: { name: string; label: string; workers: Worker[]; value?: string }) {
  return (
    <div className="admin-field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={value || ''}>
        <option value="">Все флористы</option>
        {workers.map((w) => (
          <option key={w.id} value={w.id}>{w.attributes.name}</option>
        ))}
      </select>
    </div>
  );
}

export default function OrdersFilterPanel({ current, stores, sources, workers }: Props) {
  return (
    <form method="GET" action="/admin/orders" className="admin-panel">
      {/* Switching a status tab is a separate GET link — keep the current tab
          selection intact when the filter form itself is submitted. */}
      {current.status && <input type="hidden" name="status" value={current.status} />}

      <p className="admin-panel__title">Фильтр заказов</p>

      <div className="admin-filter-actions">
        <button type="submit" className="admin-btn admin-btn--primary">Применить фильтр</button>
        <a href="/admin/orders" className="admin-btn admin-btn--outline-blue">Сбросить фильтры</a>
      </div>

      <div className="admin-field">
        <label htmlFor="dueFrom">Дата исполнения</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="date" id="dueFrom" name="dueFrom" defaultValue={current.dueFrom || ''} />
          <input type="date" name="dueTo" defaultValue={current.dueTo || ''} />
        </div>
      </div>

      <div className="admin-field">
        <label htmlFor="createdFrom">Дата создания</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="date" id="createdFrom" name="createdFrom" defaultValue={current.createdFrom || ''} />
          <input type="date" name="createdTo" defaultValue={current.createdTo || ''} />
        </div>
      </div>

      <div className="admin-field">
        <label htmlFor="closedFrom">Дата закрытия</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="date" id="closedFrom" name="closedFrom" defaultValue={current.closedFrom || ''} />
          <input type="date" name="closedTo" defaultValue={current.closedTo || ''} />
        </div>
      </div>

      <div className="admin-field">
        <label htmlFor="source">Источник</label>
        <select id="source" name="source" defaultValue={current.source || ''}>
          <option value="">Все источники</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.attributes.title}</option>
          ))}
        </select>
      </div>

      <div className="admin-field">
        <label htmlFor="store">Торговая точка</label>
        <select id="store" name="store" defaultValue={current.store || ''}>
          <option value="">Все точки</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.attributes.title}</option>
          ))}
        </select>
      </div>

      <WorkerSelect name="createdBy" label="Кем создан" workers={workers} value={current.createdBy} />
      <WorkerSelect name="closedBy" label="Кем закрыт" workers={workers} value={current.closedBy} />
      <WorkerSelect name="florist" label="Флорист" workers={workers} value={current.florist} />
      <div style={{ height: 8 }} />
    </form>
  );
}
