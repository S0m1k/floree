import { redirect } from 'next/navigation';

interface Props {
  params: { id: string };
}

// Legacy URL — recipes replaced bouquets. Forward to the recipe page.
export default function LegacyBouquetPage({ params }: Props) {
  redirect(`/recipe/${params.id}`);
}
