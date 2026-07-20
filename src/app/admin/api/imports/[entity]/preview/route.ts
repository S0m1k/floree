import { NextRequest, NextResponse } from 'next/server';
import { adminMutateMultipart } from '@/lib/adminApi';

const ENTITIES = new Set(['customers', 'items']);

// POST /admin/api/imports/[entity]/preview — the import wizard's step 1.
// `adminMutate` always JSON-encodes its body, which can't carry a File, so
// this route re-packs the incoming multipart form and forwards it with
// `adminMutateMultipart` instead (Bearer token from the httpOnly cookie,
// same as every other admin proxy route).
export async function POST(
  request: NextRequest,
  { params }: { params: { entity: string } },
) {
  if (!ENTITIES.has(params.entity)) {
    return NextResponse.json({ detail: 'Unknown import entity' }, { status: 404 });
  }

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const file = incoming.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ detail: 'Файл не найден' }, { status: 400 });
  }

  const forward = new FormData();
  forward.set('file', file, file instanceof File ? file.name : 'upload');

  const res = await adminMutateMultipart(`/api/v1/imports/${params.entity}/preview`, forward);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
