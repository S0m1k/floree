'use client';

import { ChangeEvent, DragEvent, useRef, useState } from 'react';

export type ImportEntity = 'customers' | 'items';

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
}

// Column→field targets offered in the mapping selects, per entity
// (admin-map §2.5.3 «Импорт клиентов»; §2.3.7-по-мотивам for items — our own
// nomenclature-from-file import instead of Posiflora's vendor catalog pick).
const FIELD_CONFIG: Record<ImportEntity, FieldDef[]> = {
  customers: [
    { key: 'phone', label: 'Телефон', required: true },
    { key: 'name', label: 'Имя' },
    { key: 'birthday', label: 'Дата рождения' },
    { key: 'email', label: 'Email' },
    { key: 'comment', label: 'Комментарий' },
  ],
  items: [
    { key: 'title', label: 'Название', required: true },
    { key: 'max_price', label: 'Цена' },
    { key: 'barcode', label: 'Штрихкод' },
    { key: 'category', label: 'Категория' },
  ],
};

interface PreviewResponse {
  fileToken: string;
  columns: string[];
  rows: string[][];
  suggestedMapping: Record<string, number>;
}

interface ImportError {
  row: number;
  message: string;
}

interface RunResult {
  created: number;
  skipped: number;
  errors: ImportError[];
}

interface Props {
  entity: ImportEntity;
  backHref: string;
}

// Two-step import wizard shared by /admin/customers/import and
// /admin/catalog/import: upload a file → confirm the column mapping →
// run the import and show the created/skipped/error summary.
export default function ImportWizard({ entity, backHref }: Props) {
  const fields = FIELD_CONFIG[entity];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  // One entry per file column: the field key it maps to, or '' to skip it.
  const [columnFields, setColumnFields] = useState<string[]>([]);
  const [skipFirstRow, setSkipFirstRow] = useState(true);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const reset = () => {
    setPreview(null);
    setColumnFields([]);
    setResult(null);
    setError(null);
    setFileName(null);
    setSkipFirstRow(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFile = async (file: File) => {
    setError(null);
    setResult(null);
    setFileName(file.name);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/admin/api/imports/${entity}/preview`, { method: 'POST', body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось прочитать файл');
      }
      const data = json as PreviewResponse;
      setPreview(data);
      const cols = new Array(data.columns.length).fill('');
      for (const [field, idx] of Object.entries(data.suggestedMapping || {})) {
        if (idx >= 0 && idx < cols.length) cols[idx] = field;
      }
      setColumnFields(cols);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const setColumnField = (colIdx: number, field: string) => {
    setColumnFields((prev) => {
      const next = [...prev];
      // Each field can be claimed by only one column at a time.
      if (field) {
        for (let i = 0; i < next.length; i += 1) {
          if (i !== colIdx && next[i] === field) next[i] = '';
        }
      }
      next[colIdx] = field;
      return next;
    });
  };

  const buildMapping = (): Record<string, number> => {
    const mapping: Record<string, number> = {};
    columnFields.forEach((field, idx) => {
      if (field) mapping[field] = idx;
    });
    return mapping;
  };

  const missingRequired = fields.filter((f) => f.required && !columnFields.includes(f.key));

  const runImport = async () => {
    if (!preview) return;
    if (missingRequired.length > 0) {
      setError(`Сопоставьте обязательное поле «${missingRequired[0].label}»`);
      return;
    }
    setError(null);
    setRunning(true);
    try {
      const res = await fetch(`/admin/api/imports/${entity}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileToken: preview.fileToken, mapping: buildMapping(), skipFirstRow }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось выполнить импорт');
      }
      setResult(json as RunResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="admin-import-wizard">
      {!result && (
        <div className="admin-panel" style={{ marginBottom: 16 }}>
          <p className="admin-panel__title">Шаг 1. Файл</p>
          <div className="admin-import-actions">
            <a href={`/admin/api/imports/${entity}/template`} className="admin-btn">Скачать пример</a>
          </div>

          <div
            className={`admin-import-dropzone ${dragActive ? 'admin-import-dropzone--active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <span className="material-symbols-outlined admin-import-dropzone__icon">upload_file</span>
            <p>{fileName || 'Перетащите файл .xlsx или .csv сюда'}</p>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Загружаем…' : 'Загрузить файл'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              style={{ display: 'none' }}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)}
            />
          </div>

          {error && !preview && <div className="admin-form-error">{error}</div>}
        </div>
      )}

      {preview && !result && (
        <div className="admin-panel">
          <p className="admin-panel__title">Шаг 2. Сопоставление колонок</p>

          <label className="admin-import-skip-row">
            <input
              type="checkbox"
              checked={skipFirstRow}
              onChange={(e) => setSkipFirstRow(e.target.checked)}
            />
            Первая строка — заголовки
          </label>

          <div className="admin-table-wrap admin-import-table-wrap">
            <table className="admin-table admin-import-table">
              <thead>
                <tr>
                  {preview.columns.map((col, idx) => (
                    <th key={idx}>
                      <select value={columnFields[idx] || ''} onChange={(e) => setColumnField(idx, e.target.value)}>
                        <option value="">— пропустить —</option>
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                        ))}
                      </select>
                      <div className="admin-import-col-label" title={col}>{col}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className={rowIdx === 0 && skipFirstRow ? 'admin-import-row--skipped' : ''}>
                    {preview.columns.map((_, colIdx) => (
                      <td key={colIdx}>{row[colIdx] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <div className="admin-form-error">{error}</div>}

          <div className="admin-form-actions" style={{ padding: 16 }}>
            <button type="button" className="admin-btn" onClick={reset} disabled={running}>
              Загрузить другой файл
            </button>
            <button type="button" className="admin-btn admin-btn--primary" onClick={runImport} disabled={running}>
              {running ? 'Импортируем…' : 'Импортировать'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="admin-panel">
          <p className="admin-panel__title">Результат импорта</p>

          <div className="admin-import-summary">
            <div className="admin-import-summary__item admin-import-summary__item--ok">
              <span className="admin-import-summary__value">{result.created}</span>
              <span>Создано</span>
            </div>
            <div className="admin-import-summary__item">
              <span className="admin-import-summary__value">{result.skipped}</span>
              <span>Пропущено (уже существуют)</span>
            </div>
            <div className="admin-import-summary__item admin-import-summary__item--error">
              <span className="admin-import-summary__value">{result.errors.length}</span>
              <span>Ошибок</span>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="admin-table-wrap" style={{ margin: '0 16px 16px' }}>
              <table className="admin-table">
                <thead>
                  <tr><th>Строка</th><th>Ошибка</th></tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i}><td>{e.row}</td><td>{e.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-form-actions" style={{ padding: 16 }}>
            <a href={backHref} className="admin-btn">К списку</a>
            <button type="button" className="admin-btn admin-btn--primary" onClick={reset}>
              Загрузить ещё файл
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
