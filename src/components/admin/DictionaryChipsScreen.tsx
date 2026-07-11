import SettingsNav from '@/components/admin/SettingsNav';
import DictionaryChips from '@/components/admin/DictionaryChips';
import { DictType, getDictionary } from '@/lib/adminSettings';

interface Props {
  route: string; // page route, e.g. /admin/order-tags
  apiType: DictType; // backend dictionary path (differs for customer-deal-sources)
  title: string;
  placeholder: string;
}

// Server-side body shared by all seven chip-list settings screens
// (admin-map §2.7): SettingsNav + title + generic DictionaryChips.
export default async function DictionaryChipsScreen({ route, apiType, title, placeholder }: Props) {
  const entries = await getDictionary(apiType);
  return (
    <div>
      <SettingsNav active={route} />
      <h1 className="admin-title">{title}</h1>
      <DictionaryChips apiType={apiType} placeholder={placeholder} entries={entries} />
    </div>
  );
}
