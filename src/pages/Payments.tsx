import React, { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../store/auth';
import Loader from '../components/ui/Loader';

type Fund = { id: string; name: string };
type Provider = { id: string; name: string };
type Estado = 'Pendiente' | 'Confirmado' | 'Anulado';

type PaymentRow = {
  id: string;
  fund_id: string;
  provider_id: string | null;
  provider_name: string | null;

  fecha: string;                 // ISO
  monto: number;

  medio?: string | null;
  comprobante?: string | null;
  pdf_url?: string | null;
  factura_id?: string | null;

  estado: Estado;
  notas?: string | null;

  created_at: string;
  updated_at: string;
};

// Normaliza cualquier shape del backend al tipo PaymentRow
function normalizePaymentRow(p: any): PaymentRow {
  return {
    id: p.id,
    fund_id: p.fund_id,
    provider_id: p.provider_id ?? p.provider?.id ?? null,
    provider_name: p.provider_name ?? p.provider?.name ?? null,

    fecha: String(p.fecha ?? p.fecha_emision ?? p.created_at ?? ''),
    monto: Number(p.monto ?? p.monto_total ?? 0),

    medio: p.medio ?? p.metodo_pago ?? null,
    comprobante: p.comprobante ?? null,
    pdf_url: p.pdf_url ?? p.comprobante_url ?? null,
    factura_id: p.factura_id ?? null,

    estado: (p.estado ?? 'Pendiente') as Estado,
    notas: p.notas ?? null,

    created_at: p.created_at ?? String(new Date().toISOString()),
    updated_at: p.updated_at ?? String(new Date().toISOString()),
  };
}

const fmtMoney = (n: number | undefined) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
    .format(Number(n || 0));

const fmtDate = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(new Date(iso)) : '—';

function EstadoPill({ estado }: { estado: Estado }) {
  const base = 'liq-status';
  const cls =
    estado === 'Confirmado'
      ? `${base} liq-status--closed`
      : estado === 'Anulado'
      ? `${base} liq-status--hidden`
      : `${base} liq-status--open`;
  return <span className={cls}>{estado}</span>;
}

function PaymentDetailModal({
  open, id, onClose, fundsById, providersById,
}: {
  open: boolean;
  id: string | null;
  onClose: () => void;
  fundsById: Record<string, string>;
  providersById: Record<string, string>;
}) {
  const [data, setData] = useState<PaymentRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      if (!open || !id) return;
      setLoading(true);
      try {
        const { data } = await api.get<any>(`/payments/${id}`);
        if (!cancel) setData(normalizePaymentRow(data));
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    run();
    return () => { cancel = true; };
  }, [open, id]);

  if (!open || !id) return null;

  return (
    <div className="liq-modal liq-modal--wide">
      <div className="liq-modal__dialog">
        <div className="liq-modal__header">
          <h3 className="liq-modal__title">Detalle del pago</h3>
          <button className="liq-icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="liq-modal__body">
          {loading && <Loader/>}
          {!loading && data && (
            <div className="liq-detail">
              <div className="liq-detail__headerGrid">
                <div>
                  <div className="liq-label">Proveedor</div>
                  <div className="liq-value">
                    {data.provider_name ?? (data.provider_id ? providersById[data.provider_id] : null) ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="liq-label">Fondo</div>
                  <div className="liq-value">{fundsById[data.fund_id] ?? '—'}</div>
                </div>
                <div>
                  <div className="liq-label">Fecha</div>
                  <div className="liq-value">{fmtDate(data.fecha)}</div>
                </div>
                <div>
                  <div className="liq-label">Factura (N°)</div>
                  <div className="liq-value">{data.factura_id ?? '—'}</div>
                </div>
                <div>
                  <div className="liq-label">Estado</div>
                  <div className="liq-value"><EstadoPill estado={data.estado} /></div>
                </div>
              </div>

              <div className="liq-kpis">
                <div className="liq-kpi"><div className="liq-kpi__label">MONTO</div><div className="liq-kpi__value">{fmtMoney(data.monto)}</div></div>
                <div className="liq-kpi"><div className="liq-kpi__label">MEDIO</div><div className="liq-kpi__value">{data.medio || '—'}</div></div>
              </div>

              <div className="liq-card liq-card--span2">
                <div className="liq-card__title">Comprobante</div>
                <div className="liq-card__body">
                  <div style={{ display:'grid', gap:6 }}>
                    <div><b>Nro/Ref:</b> {data.comprobante || '—'}</div>
                    <div><b>PDF:</b> {data.pdf_url ? <a className="liq-link" href={data.pdf_url} target="_blank" rel="noreferrer">Abrir ↗</a> : <span className="liq-muted">—</span>}</div>
                  </div>
                </div>
              </div>

              <div className="liq-card">
                <div className="liq-card__title">Notas</div>
                <div className="liq-card__body">{(data.notas ?? '').trim() || <span className="liq-muted">Sin notas</span>}</div>
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

export default function PaymentsPage() {
  const { user } = useAuth();

  const [funds, setFunds] = useState<Fund[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // filtros
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<'Todos' | Estado>('Todos');
  const [fundId, setFundId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [from, setFrom] = useState<string>(''); // fecha >= from
  const [to, setTo] = useState<string>('');     // fecha < to + 1
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);

  const [detailId, setDetailId] = useState<string | null>(null);

  const fundsById = useMemo(
    () => funds.reduce((acc, f) => ((acc[f.id] = f.name), acc), {} as Record<string, string>),
    [funds]
  );

  const providersById = useMemo(
    () => providers.reduce((acc, p) => ((acc[p.id] = p.name), acc), {} as Record<string, string>),
    [providers]
  );

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setLoading(true);
      setErr(null);
      try {
        const [fres, provres, pres] = await Promise.all([
          api.get<Fund[]>('/funds'),
          api.get<Provider[]>('/providers'),
          api.get<any[]>('/payments', { params: { limit, offset } }),
        ]);
        if (!cancel) {
          setFunds(fres.data);
          setProviders(provres.data);
          setRows(pres.data.map(normalizePaymentRow));
        }
      } catch (e: any) {
        if (!cancel) setErr(e?.response?.data?.error ?? e.message);
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    load();
    return () => { cancel = true; };
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const params: any = { limit, offset };
      if (q.trim()) params.q = q.trim();
      if (estado !== 'Todos') params.estado = estado;
      if (fundId) params.fund_id = fundId;
      if (providerId) params.provider_id = providerId;
      if (from) params.from = from;
      if (to) params.to = to;
      const { data } = await api.get<any[]>('/payments', { params });
      setRows(data.map(normalizePaymentRow));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [offset, limit]);

  const apply = () => { setOffset(0); refresh(); };
  const next = () => setOffset(o => o + limit);
  const prev = () => setOffset(o => Math.max(0, o - limit));

  const columns = useMemo(() => [
    { key: 'fecha', label: 'Fecha' },
    { key: 'proveedor', label: 'Proveedor' },
    { key: 'factura', label: 'Factura (N°)' },
    { key: 'medio', label: 'Medio' },
    { key: 'monto', label: 'Monto' },
    { key: 'estado', label: 'Estado' },
    { key: 'acciones', label: '' },
  ], []);

  return (
    <div className="liq-page">
      <div className="liq-toolbar">
        <h2 className="liq-title">Pagos</h2>
      </div>

      {/* Filtros */}
      <div className="liq-filters">
        <input
          className="liq-input"
          placeholder="Buscar (proveedor / comprobante / factura)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          style={{ minWidth: 280 }}
        />

        <select className="liq-input" value={estado} onChange={(e) => setEstado(e.target.value as any)}>
          <option value="Todos">Todos</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Anulado">Anulado</option>
        </select>

        <select className="liq-input" value={fundId} onChange={(e) => setFundId(e.target.value)}>
          <option value="">Todos los fondos</option>
          {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>

        <input className="liq-input" placeholder="Proveedor ID (opcional)" value={providerId} onChange={(e) => setProviderId(e.target.value)} />

        <input className="liq-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Fecha desde" />
        <input className="liq-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Fecha hasta" />

        <button className="liq-btn liq-btn--primary" onClick={apply}>Aplicar</button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="liq-label" style={{ margin: 0 }}>Filas:</label>
          <select className="liq-input" value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
            {[25, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="liq-btn liq-btn--soft" onClick={prev} disabled={offset === 0}>←</button>
          <button className="liq-btn liq-btn--soft" onClick={next}>→</button>
        </div>
      </div>

      {err && <div className="liq-error">Error: {err}</div>}
      {loading && <Loader/>}

      {!loading && !err && (
        <div className="liq-tableWrap">
          <table className="liq-table">
            <thead>
              <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{fmtDate(r.fecha)}</td>
                  <td>{r.provider_name ?? (r.provider_id ? providersById[r.provider_id] : null) ?? '—'}</td>
                  <td>{r.factura_id ?? '—'}</td>
                  <td>{r.medio || '—'}</td>
                  <td className="liq-td--money">{fmtMoney(r.monto)}</td>
                  <td><EstadoPill estado={r.estado} /></td>
                  <td className="liq-td--actions">
                    <button className="liq-icon-btn" title="Ver" onClick={() => setDetailId(r.id)}>👁️</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={columns.length}><div className="liq-empty">No hay pagos.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <PaymentDetailModal
        open={!!detailId}
        id={detailId}
        onClose={() => setDetailId(null)}
        fundsById={fundsById}
        providersById={providersById}
      />
    </div>
  );
}
