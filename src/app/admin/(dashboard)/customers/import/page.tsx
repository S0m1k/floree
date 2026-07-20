import CustomersNav from '@/components/admin/CustomersNav';
import ImportWizard from '@/components/admin/ImportWizard';

export const metadata = { title: 'Импорт клиентов' };

export default function AdminCustomersImportPage() {
  return (
    <div>
      <CustomersNav active="/admin/customers/import" />
      <h1 className="admin-title">Импорт клиентов</h1>
      <ImportWizard entity="customers" backHref="/admin/customers" />
    </div>
  );
}
