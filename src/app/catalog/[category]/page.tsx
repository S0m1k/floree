import { redirect } from 'next/navigation';

interface Props {
  params: { category: string };
}

export default function CategoryPage({ params: _ }: Props) {
  redirect('/catalog');
}
