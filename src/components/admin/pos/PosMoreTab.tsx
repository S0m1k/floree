'use client';

import Link from 'next/link';
import { SimpleDictEntry } from '@/types';
import PosShiftPanel from './PosShiftPanel';
import type { PosContext } from './PosTerminal';

interface Props {
  stores: SimpleDictEntry[];
  storeId: string;
  onStoreChange: (id: string) => void;
  context: PosContext | null;
  onChanged: () => void;
  onError: (message: string | null) => void;
}

// «Ещё» — смена и касса (открытие/закрытие, внесение/изъятие), смена торговой
// точки, переход в админку и выход, как вкладка «Другое» терминала Posiflora.
export default function PosMoreTab({ stores, storeId, onStoreChange, context, onChanged, onError }: Props) {
  return (
    <div className="pos__tab">
      <h1 className="pos__title">Ещё</h1>

      {context === null ? (
        <div className="pos__empty">Загрузка…</div>
      ) : (
        <PosShiftPanel storeId={storeId} context={context} onChanged={onChanged} onError={onError} />
      )}

      {stores.length > 1 && (
        <div className="pos__more-item">
          <span>Торговая точка</span>
          <select value={storeId} onChange={(e) => onStoreChange(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.attributes.title}</option>
            ))}
          </select>
        </div>
      )}
      {stores.length === 1 && (
        <div className="pos__more-item">
          <span>Торговая точка</span>
          <strong>{stores[0].attributes.title}</strong>
        </div>
      )}

      <Link href="/admin/orders" className="pos__more-item pos__more-item--link">
        В админку →
      </Link>
      <Link href="/admin/logout" className="pos__more-item pos__more-item--link">
        Выйти из системы
      </Link>
    </div>
  );
}
