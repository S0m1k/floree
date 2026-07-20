'use client';

import { useState } from 'react';
import type { PosContext } from './PosTerminal';

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n * 100) / 100) + ' ₽';

interface Props {
  storeId: string;
  context: PosContext;
  onChanged: () => void;
  onError: (message: string | null) => void;
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; json: any }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

// Панель смены: открытие/закрытие с пересчётом нала и внесение/изъятие.
export default function PosShiftPanel({ storeId, context, onChanged, onError }: Props) {
  const [counted, setCounted] = useState('');
  const [closing, setClosing] = useState(false);
  const [cashOp, setCashOp] = useState<'in' | 'out' | null>(null);
  const [opAmount, setOpAmount] = useState('');
  const [opReason, setOpReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [closeResult, setCloseResult] = useState<string | null>(null);

  const shift = context.shift;

  const run = async (action: () => Promise<{ ok: boolean; json: any }>) => {
    setBusy(true);
    onError(null);
    try {
      const { ok, json } = await action();
      if (!ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Ошибка кассы');
      return json;
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Ошибка');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openShift = async () => {
    const json = await run(() =>
      postJson('/admin/api/pos/shifts', { storeId, countedCash: Number(counted) || 0 }),
    );
    if (json) {
      setCounted('');
      onChanged();
    }
  };

  const closeShift = async () => {
    if (!shift) return;
    const json = await run(() =>
      postJson(`/admin/api/pos/shifts/${shift.id}/close`, { countedCash: Number(counted) || 0 }),
    );
    if (json) {
      const diff = Number(json.data?.attributes?.closeDiscrepancy) || 0;
      setCloseResult(
        diff === 0
          ? 'Смена закрыта: касса сошлась.'
          : `Смена закрыта: расхождение ${diff > 0 ? '+' : ''}${fmt(diff)}.`,
      );
      setCounted('');
      setClosing(false);
      onChanged();
    }
  };

  const submitCashOp = async () => {
    if (!cashOp) return;
    const json = await run(() =>
      postJson('/admin/api/pos/cash-operations', {
        storeId,
        type: cashOp,
        amount: Number(opAmount) || 0,
        reason: opReason.trim() || undefined,
      }),
    );
    if (json) {
      setCashOp(null);
      setOpAmount('');
      setOpReason('');
      onChanged();
    }
  };

  if (!shift) {
    return (
      <section className="pos__shift pos__shift--closed">
        <h2>Смена не открыта</h2>
        {closeResult && <p className="pos__shift-note">{closeResult}</p>}
        <p>Пересчитайте наличные в кассе. Ожидается: <strong>{fmt(context.expectedOpeningCash)}</strong></p>
        <div className="pos__shift-row">
          <input
            type="number"
            min={0}
            placeholder="Наличных в кассе, ₽"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={openShift}
            disabled={busy || counted === ''}
          >
            Открыть смену
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pos__shift">
      <div className="pos__shift-stats">
        <span>Продаж: <strong>{context.salesCount}</strong> на <strong>{fmt(context.salesTotal)}</strong></span>
        <span>Нал в кассе (ожидается): <strong>{fmt(context.expectedCash)}</strong></span>
      </div>
      <div className="pos__shift-actions">
        <button type="button" className="admin-btn" onClick={() => { setCashOp('in'); setClosing(false); }}>
          Внесение
        </button>
        <button type="button" className="admin-btn" onClick={() => { setCashOp('out'); setClosing(false); }}>
          Изъятие
        </button>
        <button type="button" className="admin-btn" onClick={() => { setClosing((v) => !v); setCashOp(null); }}>
          Закрыть смену
        </button>
      </div>

      {cashOp && (
        <div className="pos__shift-row">
          <span>{cashOp === 'in' ? 'Внесение' : 'Изъятие'}:</span>
          <input
            type="number"
            min={0}
            placeholder="Сумма, ₽"
            value={opAmount}
            onChange={(e) => setOpAmount(e.target.value)}
          />
          <input
            type="text"
            placeholder="Причина (необязательно)"
            value={opReason}
            onChange={(e) => setOpReason(e.target.value)}
          />
          <button type="button" className="admin-btn admin-btn--primary" onClick={submitCashOp} disabled={busy || !opAmount}>
            Провести
          </button>
          <button type="button" className="admin-btn" onClick={() => setCashOp(null)}>Отмена</button>
        </div>
      )}

      {closing && (
        <div className="pos__shift-row">
          <span>Пересчитайте кассу (ожидается {fmt(context.expectedCash)}):</span>
          <input
            type="number"
            min={0}
            placeholder="Наличных в кассе, ₽"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
          <button type="button" className="admin-btn admin-btn--primary" onClick={closeShift} disabled={busy || counted === ''}>
            Закрыть смену
          </button>
          <button type="button" className="admin-btn" onClick={() => setClosing(false)}>Отмена</button>
        </div>
      )}
    </section>
  );
}
