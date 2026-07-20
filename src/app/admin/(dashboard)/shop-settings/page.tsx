import BouquetsNav from '@/components/admin/BouquetsNav';
import ShopSettingsForm from '@/components/admin/ShopSettingsForm';
import ShopPublicationTable from '@/components/admin/ShopPublicationTable';
import { getShopSettings, getShopSummary, getShopPublicationSpecs } from '@/lib/adminShop';

export const metadata = { title: 'Онлайн-витрина' };

// «Онлайн-витрина» (admin-map §2.3.2). In Posiflora this is a paid upsell
// landing page; here it manages real settings + a publication summary for
// our own public storefront (floree.ru — this repo's public pages).
export default async function ShopSettingsPage() {
  const [settings, summary, publication] = await Promise.all([
    getShopSettings(),
    getShopSummary(),
    getShopPublicationSpecs(),
  ]);

  const isEnabled = settings?.isEnabled ?? true;

  return (
    <div>
      <BouquetsNav active="/admin/shop-settings" />
      <h1 className="admin-title">Онлайн-витрина</h1>

      <div className="admin-shop-header">
        <span className={`admin-staff-status ${isEnabled ? 'admin-staff-status--active' : 'admin-staff-status--inactive'}`}>
          {isEnabled ? 'Витрина работает' : 'Витрина выключена'}
        </span>
        <a href="https://floree.ru" target="_blank" rel="noopener noreferrer" className="admin-shop-header__link">
          floree.ru
          <span className="material-symbols-outlined">open_in_new</span>
        </a>
      </div>

      <div className="admin-metric-grid">
        <div className="admin-metric-card">
          <div className="admin-metric-card__label">Опубликовано рецептов</div>
          <div className="admin-metric-card__value">
            {summary ? `${summary.publishedRecipes} из ${summary.totalRecipes}` : '—'}
          </div>
        </div>
        <div className="admin-metric-card">
          <div className="admin-metric-card__label">Товаров на сайте</div>
          <div className="admin-metric-card__value">{summary ? summary.publishedItems : '—'}</div>
        </div>
        <div className="admin-metric-card">
          <div className="admin-metric-card__label">Заказов с сайта за 7 дней</div>
          <div className="admin-metric-card__value">{summary ? summary.lastOrders : '—'}</div>
          {summary && !summary.lastOrdersSourceFound && (
            <div className="admin-metric-card__value--muted">
              источник «Сайт» не найден в справочнике источников — считаем 0
            </div>
          )}
        </div>
      </div>

      <ShopSettingsForm initial={settings} />

      <p className="admin-panel__title" style={{ marginTop: 24 }}>Публикация на сайте</p>
      <ShopPublicationTable specifications={publication.specifications} total={publication.total} />
    </div>
  );
}
