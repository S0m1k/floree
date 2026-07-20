import BouquetsNav from '@/components/admin/BouquetsNav';
import ImportWizard from '@/components/admin/ImportWizard';

export const metadata = { title: 'Импорт каталога' };

export default function AdminCatalogImportPage() {
  return (
    <div>
      <BouquetsNav active="/admin/catalog/import" />
      <h1 className="admin-title">Импорт каталога</h1>
      <ImportWizard entity="items" backHref="/admin/catalog" />
    </div>
  );
}
