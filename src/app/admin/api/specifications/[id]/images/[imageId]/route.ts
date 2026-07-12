import { NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// DELETE /admin/api/specifications/[id]/images/[imageId] — remove a gallery
// photo (clears «Основное фото» too if it was the main one). Proxies to the
// backend DELETE /api/v1/specifications/{id}/images/{imageId}.
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; imageId: string } },
) {
  const res = await adminMutate(
    `/api/v1/specifications/${params.id}/images/${params.imageId}`,
    'DELETE',
    undefined,
  );
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
