import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

const ENTITIES = new Set(['customers', 'items']);

// POST /admin/api/imports/[entity]/run — the import wizard's step 2: the
// confirmed column mapping + the fileToken from the preview step, proxied
// straight to the backend which re-parses the saved upload.
export async function POST(
  request: NextRequest,
  { params }: { params: { entity: string } },
) {
  if (!ENTITIES.has(params.entity)) {
    return NextResponse.json({ detail: 'Unknown import entity' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate(`/api/v1/imports/${params.entity}/run`, 'POST', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
