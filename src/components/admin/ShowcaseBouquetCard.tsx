import { AdminShowcaseBouquet } from '@/types';
import { fmtMoney, fmtDateTime } from '@/lib/format';
import { bouquetNumber, expiryDaysLeft, plural } from '@/lib/showcaseFormat';
import DisassembleButton from './DisassembleButton';

export default function ShowcaseBouquetCard({ bouquet }: { bouquet: AdminShowcaseBouquet }) {
  const a = bouquet.attributes;
  const daysLeft = expiryDaysLeft(a.createdAt);

  return (
    <div className="admin-showcase-card">
      <div className="admin-showcase-card__photo">
        <span className="material-symbols-outlined admin-showcase-card__placeholder">local_florist</span>
        <span className="admin-showcase-card__badge admin-showcase-card__badge--price">{fmtMoney(a.saleAmount)}</span>
        <span className="admin-showcase-card__badge admin-showcase-card__badge--expiry">
          {daysLeft} {plural(daysLeft, ['день', 'дня', 'дней'])}
        </span>
      </div>
      <div className="admin-showcase-card__body">
        <div className="admin-showcase-card__title">{a.title}</div>
        <div className="admin-showcase-card__meta">Собран {fmtDateTime(a.createdAt)}</div>
        {/* No florist on the Bouquet model (backend/app/catalog_models.py) —
            the ETL doesn't carry one, so this line is skipped rather than
            faked with a "—". */}
        <div className="admin-showcase-card__number">№{bouquetNumber(bouquet)}</div>
        <DisassembleButton bouquetId={bouquet.id} title={a.title} />
        <button
          type="button"
          className="admin-btn admin-btn--outline-blue admin-showcase-card__print"
          disabled
          title="Пока недоступно"
        >
          Распечатать штрихкод
        </button>
      </div>
    </div>
  );
}
