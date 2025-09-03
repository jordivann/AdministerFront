// src/pages/Liquidaciones.tsx
import React, { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../store/auth';
import './styles/Liquidaciones.css';
import Loader from '../components/ui/Loader';

type Fund = { id: string; name: string };

type LiqListRow = {
  id: string;
  name: string;
  fund_id: string | null;
  status: 'En curso' | 'Cerrada' | 'Oculta';
  created_at: string;
  updated_at: string;
  payment_method?: 'efectivo' | 'transferencia' | 'cheques fisicos' | 'echeqs' | 'otros';
  // Resumen (viene de app.liquidaciones_resumen)
  total_liquidacion: number; // suma de facturas
  neto_liquidacion?: number;
  iva_liquidacion?: number;
  subtotal_gastos_y_pagos_adm: number;
  subtotal_trabajos: number;
  saldos_positivos: number;
  saldos_negativos: number;
  // Calculado en GET /
  total_final: number; // saldo final = ingreso_banco - impositivo - gastos - trabajos - saldos- + saldos+
};

type LiqLine = { id?: string; detalle?: string; monto: number };
type LiqFactura = { id?: string; numero: string; monto: number };
type LiqComentario = { id?: string; creador?: string; mensaje: string; created_at?: string };

type LiquidacionDetail = {
  id: string;
  name: string;
  client_id: string | null;
  fund_id: string | null;
  payment_method: LiqListRow['payment_method'];
  impositivo: number;
  ingreso_banco: number;
  status: LiqListRow['status'];
  created_at: string;
  updated_at: string;
  resumen: {
    total_liquidacion: number;
    neto_liquidacion: number;
    iva_liquidacion: number;
    subtotal_gastos_y_pagos_adm: number;
    subtotal_trabajos: number;
    saldos_positivos: number;
    saldos_negativos: number;
    facturas_count: number;
    total_final: number;
  };
  facturas: LiqFactura[];
  detalle_gastos: LiqLine[];
  detalle_trabajos: LiqLine[];
  saldos_positivos: LiqLine[];
  saldos_negativos: LiqLine[];
  comentarios: LiqComentario[];
};

const fmtMoney = (n: number | undefined) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(n || 0));

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(new Date(iso));

const isAdminUser = (roles: string[] | undefined) => {
  const list = (roles ?? []).map((r) => String(r).toLowerCase());
  return list.includes('admin') || list.includes('owner');
};

/* ===================== Componentes UI pequeños ===================== */

function StatusPill({ status }: { status: LiqListRow['status'] }) {
  const cls =
    status === 'Cerrada'
      ? 'liq-status liq-status--closed'
      : status === 'Oculta'
      ? 'liq-status liq-status--hidden'
      : 'liq-status liq-status--open';
  return <span className={cls}>{status}</span>;
}

function DangerConfirm({
  onConfirm,
  onCancel,
  text,
}: {
  text: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="liq-confirm">
      <div className="liq-confirm__box">
        <div className="liq-confirm__title">Confirmar</div>
        <div className="liq-confirm__text">{text}</div>
        <div className="liq-confirm__actions">
          <button className="liq-btn liq-btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button className="liq-btn liq-btn--danger" onClick={onConfirm}>
            Borrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== Formulario de Creación / Edición ============== */

type EditorInitial =
  | {
      mode: 'create';
      data?: undefined;
    }
  | {
      mode: 'edit';
      data: LiquidacionDetail;
    };

function LiqEditorModal({
  open,
  onClose,
  funds,
  initial,
  onCreatedOrUpdated,
}: {
  open: boolean;
  onClose: () => void;
  funds: Fund[];
  initial: EditorInitial;
  onCreatedOrUpdated: () => void;
}) {
  const isEdit = initial.mode === 'edit';
  const base = initial.mode === 'edit' ? initial.data : undefined;

  // Campos de cabecera
  const [name, setName] = useState(base?.name ?? '');
  const [fundId, setFundId] = useState<string>(base?.fund_id ?? (funds[0]?.id ?? ''));
  const [method, setMethod] = useState<LiqListRow['payment_method']>(base?.payment_method ?? 'efectivo');
  const [status, setStatus] = useState<LiqListRow['status']>(base?.status ?? 'En curso');
  const [ingresoBanco, setIngresoBanco] = useState<string>(String(base?.ingreso_banco ?? '0'));
  const [impositivo, setImpositivo] = useState<string>(String(base?.impositivo ?? '0'));

  // Líneas
  const [facturas, setFacturas] = useState<LiqFactura[]>(
    base?.facturas?.length ? base.facturas : [{ numero: '', monto: 0 }]
  );
  const [gastos, setGastos] = useState<LiqLine[]>(base?.detalle_gastos ?? []);
  const [trabajos, setTrabajos] = useState<LiqLine[]>(base?.detalle_trabajos ?? []);
  const [saldosPos, setSaldosPos] = useState<LiqLine[]>(base?.saldos_positivos ?? []);
  const [saldosNeg, setSaldosNeg] = useState<LiqLine[]>(base?.saldos_negativos ?? []);
  const [comentario, setComentario] = useState<string>('');

  useEffect(() => {
    if (open) {
      // Reset cuando cambia open/initial
      if (isEdit && base) {
        setName(base.name);
        setFundId(base.fund_id ?? funds[0]?.id ?? '');
        setMethod(base.payment_method ?? 'efectivo');
        setStatus(base.status);
        setIngresoBanco(String(base.ingreso_banco ?? '0'));
        setImpositivo(String(base.impositivo ?? '0'));
        setFacturas(base.facturas?.length ? base.facturas : [{ numero: '', monto: 0 }]);
        setGastos(base.detalle_gastos ?? []);
        setTrabajos(base.detalle_trabajos ?? []);
        setSaldosPos(base.saldos_positivos ?? []);
        setSaldosNeg(base.saldos_negativos ?? []);
      } else if (!isEdit) {
        setName('');
        setFundId(funds[0]?.id ?? '');
        setMethod('efectivo');
        setStatus('En curso');
        setIngresoBanco('0');
        setImpositivo('0');
        setFacturas([{ numero: '', monto: 0 }]);
        setGastos([]);
        setTrabajos([]);
        setSaldosPos([]);
        setSaldosNeg([]);
        setComentario('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.mode, base?.id]);

  if (!open) return null;

  const upsert = async () => {
  // Validación mínima
  const hasFactura = facturas.some((f) => f.numero.trim() && Number(f.monto) > 0);
  if (!name.trim()) return alert('Falta el nombre');
  if (!fundId) return alert('Falta seleccionar fondo');
  if (!hasFactura) return alert('Debe cargar al menos una factura (número y monto)');

  const header = {
    name: name.trim(),
    client_id: null as string | null,
    fund_id: fundId,
    payment_method: method!,
    status,
    ingreso_banco: Number(ingresoBanco || 0),
    impositivo: Number(impositivo || 0),
  };

  const lines = {
    facturas: facturas
      .filter((f) => f.numero.trim() && Number(f.monto) > 0)
      .map((f) => ({ numero: f.numero.trim(), monto: Number(f.monto) })),
    detalle_gastos: gastos
      .filter((g) => (g.detalle ?? '').trim())
      .map((g) => ({ detalle: g.detalle!.trim(), monto: Number(g.monto || 0) })),
    detalle_trabajos: trabajos
      .filter((t) => (t.detalle ?? '').trim())
      .map((t) => ({ detalle: t.detalle!.trim(), monto: Number(t.monto || 0) })),
    saldos_positivos: saldosPos
      .filter((s) => (s.detalle ?? '').trim())
      .map((s) => ({ detalle: s.detalle!.trim(), monto: Number(s.monto || 0) })),
    saldos_negativos: saldosNeg
      .filter((s) => (s.detalle ?? '').trim())
      .map((s) => ({ detalle: s.detalle!.trim(), monto: Number(s.monto || 0) })),
  };

  if (isEdit && base) {
    // 1) Actualiza header
    await api.patch(`/liquidaciones/${base.id}`, header);
    // 2) Reemplaza TODAS las líneas (agrega/quita/actualiza)
    await api.put(`/liquidaciones/${base.id}/lines`, lines);
    // 3) Comentario inicial opcional (si querés, podrías tener un endpoint de comentarios aparte)
    if (comentario.trim()) {
      await api.patch(`/liquidaciones/${base.id}`, {}); // (placeholder si luego sumás endpoint /comments)
    }
  } else {
    // Crear nueva (incluye header + líneas + comentario)
    await api.post('/liquidaciones', {
      ...header,
      ...lines,
      comentarios: comentario.trim() ? [{ mensaje: comentario.trim() }] : [],
    });
  }

  onCreatedOrUpdated();
  onClose();
};


  const addRow = (list: LiqLine[], set: (v: LiqLine[]) => void) => set([...list, { detalle: '', monto: 0 }]);
  const addFactura = () => setFacturas([...facturas, { numero: '', monto: 0 }]);

  const removeRow = (idx: number, list: any[], set: (v: any[]) => void) => {
    set(list.filter((_, i) => i !== idx));
  };

  const updateLine =
    <T extends LiqLine | LiqFactura>(
      list: T[],
      set: (v: T[]) => void,
      idx: number,
      key: keyof T,
      val: any
    ) =>
    () => {
      const next = [...list];
      (next[idx] as any)[key] = key === 'monto' ? Number(val) : val;
      set(next);
    };

  return (
    <div className="liq-modal">
      <div className="liq-modal__dialog">
        <div className="liq-modal__header">
          <h3 className="liq-modal__title">{isEdit ? 'Editar liquidación' : 'Nueva liquidación'}</h3>
          <button className="liq-icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="liq-modal__body">
          <div className="liq-form">
            <div className="liq-form__row">
              <label>Nombre</label>
              <input className="liq-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="liq-form__row">
              <label>Fondo</label>
              <select className="liq-input" value={fundId} onChange={(e) => setFundId(e.target.value)}>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div className="liq-form__row">
              <label>Método de pago</label>
              <select
                className="liq-input"
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
              >
                <option value="efectivo">efectivo</option>
                <option value="transferencia">transferencia</option>
                <option value="cheques fisicos">cheques fisicos</option>
                <option value="echeqs">echeqs</option>
                <option value="otros">otros</option>
              </select>
            </div>

            <div className="liq-form__row">
              <label>Estado</label>
              <select className="liq-input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option>En curso</option>
                <option>Cerrada</option>
                <option>Oculta</option>
              </select>
            </div>

            <div className="liq-form__row">
              <label>Ingreso por banco</label>
              <input
                className="liq-input"
                type="number"
                step="0.01"
                value={ingresoBanco}
                onChange={(e) => setIngresoBanco(e.target.value)}
              />
            </div>

            <div className="liq-form__row">
              <label>Impositivo</label>
              <input
                className="liq-input"
                type="number"
                step="0.01"
                value={impositivo}
                onChange={(e) => setImpositivo(e.target.value)}
              />
            </div>

            {/* Facturas */}
            <div className="liq-fieldset">
              <div className="liq-fieldset__legend">Facturas</div>
              <div className="liq-lines">
                {facturas.map((f, idx) => (
                  <div className="liq-line" key={`fac-${idx}`}>
                    <input
                      className="liq-input"
                      placeholder="Nro. factura"
                      value={f.numero}
                      onChange={(e) => updateLine(facturas, setFacturas, idx, 'numero', e.target.value)()}
                    />
                    <input
                      className="liq-input"
                      type="number"
                      step="0.01"
                      placeholder="Monto"
                      value={String(f.monto)}
                      onChange={(e) => updateLine(facturas, setFacturas, idx, 'monto', e.target.value)()}
                    />
                    <button className="liq-icon-btn" onClick={() => removeRow(idx, facturas, setFacturas)} title="Quitar">🗑️</button>
                  </div>
                ))}
              </div>
              <button className="liq-btn liq-btn--soft" onClick={addFactura}>+ Agregar factura</button>
            </div>

            {/* Gastos */}
            <div className="liq-fieldset">
              <div className="liq-fieldset__legend">Gastos y Pagos Adm.</div>
              <div className="liq-lines">
                {gastos.map((g, idx) => (
                  <div className="liq-line" key={`gto-${idx}`}>
                    <input
                      className="liq-input"
                      placeholder="Detalle"
                      value={g.detalle ?? ''}
                      onChange={(e) => updateLine(gastos, setGastos, idx, 'detalle', e.target.value)()}
                    />
                    <input
                      className="liq-input"
                      type="number"
                      step="0.01"
                      placeholder="Monto"
                      value={String(g.monto)}
                      onChange={(e) => updateLine(gastos, setGastos, idx, 'monto', e.target.value)()}
                    />
                    <button className="liq-icon-btn" onClick={() => removeRow(idx, gastos, setGastos)}>🗑️</button>
                  </div>
                ))}
              </div>
              <button className="liq-btn liq-btn--soft" onClick={() => addRow(gastos, setGastos)}>+ Agregar gasto</button>
            </div>

            {/* Trabajos */}
            <div className="liq-fieldset">
              <div className="liq-fieldset__legend">Trabajos pagados</div>
              <div className="liq-lines">
                {trabajos.map((t, idx) => (
                  <div className="liq-line" key={`trb-${idx}`}>
                    <input
                      className="liq-input"
                      placeholder="Detalle"
                      value={t.detalle ?? ''}
                      onChange={(e) => updateLine(trabajos, setTrabajos, idx, 'detalle', e.target.value)()}
                    />
                    <input
                      className="liq-input"
                      type="number"
                      step="0.01"
                      placeholder="Monto"
                      value={String(t.monto)}
                      onChange={(e) => updateLine(trabajos, setTrabajos, idx, 'monto', e.target.value)()}
                    />
                    <button className="liq-icon-btn" onClick={() => removeRow(idx, trabajos, setTrabajos)}>🗑️</button>
                  </div>
                ))}
              </div>
              <button className="liq-btn liq-btn--soft" onClick={() => addRow(trabajos, setTrabajos)}>+ Agregar trabajo</button>
            </div>

            {/* Saldos + */}
            <div className="liq-fieldset">
              <div className="liq-fieldset__legend">Saldos positivos</div>
              <div className="liq-lines">
                {saldosPos.map((s, idx) => (
                  <div className="liq-line" key={`sp-${idx}`}>
                    <input
                      className="liq-input"
                      placeholder="Detalle"
                      value={s.detalle ?? ''}
                      onChange={(e) => updateLine(saldosPos, setSaldosPos, idx, 'detalle', e.target.value)()}
                    />
                    <input
                      className="liq-input"
                      type="number"
                      step="0.01"
                      placeholder="Monto"
                      value={String(s.monto)}
                      onChange={(e) => updateLine(saldosPos, setSaldosPos, idx, 'monto', e.target.value)()}
                    />
                    <button className="liq-icon-btn" onClick={() => removeRow(idx, saldosPos, setSaldosPos)}>🗑️</button>
                  </div>
                ))}
              </div>
              <button className="liq-btn liq-btn--soft" onClick={() => addRow(saldosPos, setSaldosPos)}>+ Agregar saldo +</button>
            </div>

            {/* Saldos - */}
            <div className="liq-fieldset">
              <div className="liq-fieldset__legend">Saldos negativos</div>
              <div className="liq-lines">
                {saldosNeg.map((s, idx) => (
                  <div className="liq-line" key={`sn-${idx}`}>
                    <input
                      className="liq-input"
                      placeholder="Detalle"
                      value={s.detalle ?? ''}
                      onChange={(e) => updateLine(saldosNeg, setSaldosNeg, idx, 'detalle', e.target.value)()}
                    />
                    <input
                      className="liq-input"
                      type="number"
                      step="0.01"
                      placeholder="Monto"
                      value={String(s.monto)}
                      onChange={(e) => updateLine(saldosNeg, setSaldosNeg, idx, 'monto', e.target.value)()}
                    />
                    <button className="liq-icon-btn" onClick={() => removeRow(idx, saldosNeg, setSaldosNeg)}>🗑️</button>
                  </div>
                ))}
              </div>
              <button className="liq-btn liq-btn--soft" onClick={() => addRow(saldosNeg, setSaldosNeg)}>+ Agregar saldo −</button>
            </div>

            {/* Comentario opcional */}
            <div className="liq-form__row">
              <label>Comentario inicial (opcional)</label>
              <textarea className="liq-input" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="liq-modal__footer">
          <button className="liq-btn liq-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="liq-btn liq-btn--primary" onClick={upsert}>{isEdit ? 'Guardar cambios' : 'Crear'}</button>
        </div>
      </div>
    </div>
  );
}

/* ============== Detalle ============== */

function LiqDetailModal({
  open,
  onClose,
  id,
  fundsById,
}: {
  open: boolean;
  onClose: () => void;
  id: string | null;
  fundsById: Record<string, string>;
}) {
  const [data, setData] = useState<LiquidacionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      if (!open || !id) return;
      setLoading(true);
      try {
        const { data } = await api.get<LiquidacionDetail>(`/liquidaciones/${id}`);
        if (!cancel) setData(data);
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    run();
    return () => {
      cancel = true;
    };
  }, [open, id]);

  if (!open || !id) return null;

  const saldoFinal = data?.resumen?.total_final ?? 0;
  const saldoClass =
    saldoFinal > 0 ? 'liq-kpi liq-kpi--pos' : saldoFinal < 0 ? 'liq-kpi liq-kpi--neg' : 'liq-kpi';

  return (
    <div className="liq-modal liq-modal--wide">
      <div className="liq-modal__dialog">
        <div className="liq-modal__header">
          <h3 className="liq-modal__title">Detalle de liquidación</h3>
          <button className="liq-icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="liq-modal__body">
          {loading && <Loader/>}
          {!loading && data && (
            <div className="liq-detail">
              {/* Cabecera */}
              <div className="liq-detail__headerGrid">
                <div><div className="liq-label">Nombre</div><div className="liq-value">{data.name}</div></div>
                {data.fund_id && (
                  <div><div className="liq-label">Fondo</div><div className="liq-value">{fundsById[data.fund_id] ?? '—'}</div></div>
                )}
                <div><div className="liq-label">Método</div><div className="liq-value">{data.payment_method}</div></div>
                <div><div className="liq-label">Estado</div><div className="liq-value"><StatusPill status={data.status} /></div></div>
                <div><div className="liq-label">Creada</div><div className="liq-value">{fmtDate(data.created_at)}</div></div>
                <div><div className="liq-label">Actualizada</div><div className="liq-value">{fmtDate(data.updated_at)}</div></div>
              </div>

              {/* KPIs */}
              <div className="liq-kpis">
                <div className="liq-kpi"><div className="liq-kpi__label">NETO</div><div className="liq-kpi__value">{fmtMoney(data.resumen.neto_liquidacion)}</div></div>
                <div className="liq-kpi"><div className="liq-kpi__label">IVA</div><div className="liq-kpi__value">{fmtMoney(data.resumen.iva_liquidacion)}</div></div>
                <div className="liq-kpi"><div className="liq-kpi__label">TOTAL FC</div><div className="liq-kpi__value">{fmtMoney(data.resumen.total_liquidacion)}</div></div>
                <div className="liq-kpi"><div className="liq-kpi__label">INGRESO X BANCO</div><div className="liq-kpi__value">{fmtMoney(data.ingreso_banco)}</div></div>

                <div className="liq-kpi"><div className="liq-kpi__label">IMPOSITIVOS</div><div className="liq-kpi__value">{fmtMoney(data.impositivo)}</div></div>
                <div className="liq-kpi"><div className="liq-kpi__label">GASTOS</div><div className="liq-kpi__value">{fmtMoney(data.resumen.subtotal_gastos_y_pagos_adm)}</div></div>
                <div className="liq-kpi"><div className="liq-kpi__label">TRABAJOS</div><div className="liq-kpi__value">{fmtMoney(data.resumen.subtotal_trabajos)}</div></div>

                <div className="liq-kpi"><div className="liq-kpi__label">SALDOS +</div><div className="liq-kpi__value">{fmtMoney(data.resumen.saldos_positivos)}</div></div>
                <div className="liq-kpi"><div className="liq-kpi__label">SALDOS −</div><div className="liq-kpi__value">{fmtMoney(data.resumen.saldos_negativos)}</div></div>

                {/* Noveno espacio (enfatiza positivo/negativo) */}
                <div className={saldoClass}>
                  <div className="liq-kpi__label">SALDO FINAL</div>
                  <div className="liq-kpi__value">{fmtMoney(saldoFinal)}</div>
                </div>
              </div>

              {/* Listas */}
              <div className="liq-columns">
                <div className="liq-card">
                  <div className="liq-card__title">Facturas ({data.resumen.facturas_count})</div>
                  <ul className="liq-list">
                    {data.facturas.map((f) => (
                      <li key={f.id ?? `${f.numero}-${f.monto}`}>{f.numero} — {fmtMoney(f.monto)}</li>
                    ))}
                  </ul>
                </div>

                <div className="liq-card">
                  <div className="liq-card__title">Gastos y Pagos Adm.</div>
                  <ul className="liq-list">
                    {data.detalle_gastos.map((g, i) => (
                      <li key={g.id ?? `g-${i}`}>{g.detalle} — {fmtMoney(g.monto)}</li>
                    ))}
                  </ul>
                </div>

                <div className="liq-card">
                  <div className="liq-card__title">Trabajos pagados</div>
                  <ul className="liq-list">
                    {data.detalle_trabajos.map((t, i) => (
                      <li key={t.id ?? `t-${i}`}>{t.detalle} — {fmtMoney(t.monto)}</li>
                    ))}
                  </ul>
                </div>

                <div className="liq-card">
                  <div className="liq-card__title">Saldos +</div>
                  <ul className="liq-list">
                    {data.saldos_positivos.map((s, i) => (
                      <li key={s.id ?? `sp-${i}`}>{s.detalle} — {fmtMoney(s.monto)}</li>
                    ))}
                  </ul>
                </div>

                <div className="liq-card">
                  <div className="liq-card__title">Saldos −</div>
                  <ul className="liq-list">
                    {data.saldos_negativos.map((s, i) => (
                      <li key={s.id ?? `sn-${i}`}>{s.detalle} — {fmtMoney(s.monto)}</li>
                    ))}
                  </ul>
                </div>

                {data.comentarios.length > 0 && (
                  <div className="liq-card liq-card--span2">
                    <div className="liq-card__title">Comentarios</div>
                    <ul className="liq-timeline">
                      {data.comentarios.map((c, i) => (
                        <li key={c.id ?? `c-${i}`}>
                          <div className="liq-timeline__meta">
                            <span className="liq-timeline__author">{c.creador ?? 'sistema'}</span>
                            <span className="liq-timeline__date">{c.created_at ? fmtDate(c.created_at) : ''}</span>
                          </div>
                          <div className="liq-timeline__text">{c.mensaje}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="liq-modal__footer">
          <button className="liq-btn liq-btn--primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/* ============== Página principal ============== */

export default function LiquidacionesPage() {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user?.roles);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [fundsById, setFundsById] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<LiqListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // UI state
  const [createOpen, setCreateOpen] = useState(false);
  const [editInit, setEditInit] = useState<EditorInitial | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fundsMap = useMemo(() => {
    const m: Record<string, string> = {};
    funds.forEach((f) => (m[f.id] = f.name));
    return m;
  }, [funds]);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setLoading(true);
      setErr(null);
      try {
        // fondos visibles por RLS
        const [fres, lres] = await Promise.all([
          api.get<Fund[]>('/funds'),
          api.get<LiqListRow[]>('/liquidaciones'),
        ]);
        if (!cancel) {
          setFunds(fres.data);
          setFundsById(fres.data.reduce((acc, f) => ((acc[f.id] = f.name), acc), {} as Record<string, string>));
          setRows(lres.data);
        }
      } catch (e: any) {
        if (!cancel) setErr(e?.response?.data?.error ?? e.message);
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    load();
    return () => {
      cancel = true;
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<LiqListRow[]>('/liquidaciones');
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditInit({ mode: 'create' });
    setCreateOpen(true);
  };

  const openEdit = async (id: string) => {
    const { data } = await api.get<LiquidacionDetail>(`/liquidaciones/${id}`);
    setEditInit({ mode: 'edit', data });
    setCreateOpen(true);
  };

  const onDelete = async (id: string) => {
    await api.delete(`/liquidaciones/${id}`);
    setConfirmDeleteId(null);
    refresh();
  };

  const columns = useMemo(() => {
    // Listado compacto
    const base = [
      { key: 'created_at', label: 'Fecha' },
      { key: 'name', label: 'Nombre' },
      { key: 'total_liquidacion', label: 'Total FC' },
      { key: 'total_final', label: 'Saldo liq.' },
      { key: 'status', label: 'Estado' },
      { key: 'actions', label: '' },
    ];
    // Si quisieras agregar Fondo SOLO para admin:
    // (lo dejo comentado; si querés, descomentá y agregá la celda)
    // if (isAdmin) base.splice(1, 0, { key: 'fund', label: 'Fondo' });
    return base;
  }, []);

  const sortedRows = useMemo(() => {
  return [...rows].sort((a, b) => {
    // 1. Prioridad: estado
    if (a.status === 'En curso' && b.status !== 'En curso') return -1;
    if (b.status === 'En curso' && a.status !== 'En curso') return 1;

    // 2. Dentro de mismo estado, ordenar por nombre (alfabético ascendente)
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
}, [rows]);


  return (
    <div className="liq-page">
      <div className="liq-toolbar">
        <h2 className="liq-title">Liquidaciones</h2>
        {isAdmin && (
          <button className="liq-btn liq-btn--primary" onClick={openCreate}>
            + Nueva
          </button>
        )}
      </div>

      {err && <div className="liq-error">Error: {err}</div>}
      {loading && <div className="liq-empty">Cargando…</div>}

      {!loading && !err && (
        <div className="liq-tableWrap">
          <table className="liq-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{r.name}</td>
                  <td className="liq-td--money">{fmtMoney(r.total_liquidacion)}</td>
                  <td className={`liq-td--money ${r.total_final > 0 ? 'is-pos' : r.total_final < 0 ? 'is-neg' : ''}`}>
                    {fmtMoney(r.total_final)}
                  </td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="liq-td--actions">
                    <button className="liq-icon-btn" title="Ver" onClick={() => setDetailId(r.id)}>👁️</button>
                    {isAdmin && (
                      <>
                        <button className="liq-icon-btn" title="Editar" onClick={() => openEdit(r.id)}>✏️</button>
                        <button className="liq-icon-btn liq-icon-btn--danger" title="Borrar" onClick={() => setConfirmDeleteId(r.id)}>🗑️</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length}>
                    <div className="liq-empty">No hay liquidaciones.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modales / Confirm */}
      <LiqEditorModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        funds={funds}
        initial={editInit || { mode: 'create' }}
        onCreatedOrUpdated={refresh}
      />

      <LiqDetailModal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        id={detailId}
        fundsById={fundsMap}
      />

      {confirmDeleteId && (
        <DangerConfirm
          text="¿Deseás borrar esta liquidación? Esta acción no se puede deshacer."
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => onDelete(confirmDeleteId)}
        />
      )}
    </div>
  );
}
