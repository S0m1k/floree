'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface GalleryImage {
  id: string;
  url: string | null;
}

interface Props {
  specId: string;
  images: GalleryImage[];
  mainImageId: string | null;
}

// Right-column photo gallery of the recipe card (admin-map §2.3.2). File
// upload isn't wired up yet — photos are added by URL; the upload button
// stays visibly disabled instead of pretending to work.
export default function SpecificationGallery({ specId, images, mainImageId }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mainImage = images.find((i) => i.id === mainImageId) || images[0] || null;
  const thumbnails = images.filter((i) => i.id !== mainImage?.id);

  const addByUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/admin/api/specifications/${specId}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trimmed }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.detail === 'string' ? json.detail : 'Не удалось добавить фото');
      setBusy(false);
      return;
    }
    setUrl('');
    setBusy(false);
    router.refresh();
  };

  const removeImage = async (imageId: string) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/admin/api/specifications/${specId}/images/${imageId}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить фото');
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  };

  const setMain = async (imageId: string) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/admin/api/specifications/${specId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { relationships: { logo: { data: { type: 'images', id: imageId } } } } }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.detail === 'string' ? json.detail : 'Не удалось назначить основное фото');
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  };

  return (
    <section className="admin-panel admin-recipe-gallery">
      <p className="admin-panel__title">Фото</p>
      <div style={{ padding: '4px 16px 16px' }}>
        <div className="admin-recipe-gallery__main">
          {mainImage?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-supplied URL, not a next/image domain
            <img src={mainImage.url} alt="Основное фото рецепта" />
          ) : (
            <span className="material-symbols-outlined admin-recipe-card__placeholder">local_florist</span>
          )}
          {mainImage && (
            <label className="admin-recipe-gallery__main-check">
              <input type="checkbox" checked readOnly disabled /> Основное фото
            </label>
          )}
        </div>

        {thumbnails.length > 0 && (
          <div className="admin-recipe-gallery__thumbs">
            {thumbnails.map((img) => (
              <div key={img.id} className="admin-recipe-gallery__thumb">
                {img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-supplied URL, not a next/image domain
                  <img src={img.url} alt="Фото рецепта" />
                ) : (
                  <span className="material-symbols-outlined admin-recipe-card__placeholder">local_florist</span>
                )}
                <div className="admin-recipe-gallery__thumb-actions">
                  <button type="button" onClick={() => setMain(img.id)} disabled={busy} title="Сделать основным">★</button>
                  <button type="button" onClick={() => removeImage(img.id)} disabled={busy} title="Удалить" aria-label="Удалить фото">×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="admin-field" style={{ marginTop: 12 }}>
          <label htmlFor="gallery-url">Ссылка на фото</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="gallery-url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…" style={{ flex: 1 }}
            />
            <button type="button" className="admin-btn admin-btn--primary" onClick={addByUrl} disabled={busy || !url.trim()}>
              + Добавить
            </button>
          </div>
        </div>

        <button
          type="button"
          className="admin-btn"
          disabled
          title="Загрузка файлов пока недоступна — используйте ссылку на фото"
          style={{ marginTop: 8 }}
        >
          + Загрузить файл (скоро)
        </button>

        {error && <div className="admin-form-error" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </section>
  );
}
