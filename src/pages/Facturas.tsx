// src/pages/Facturas.tsx
import React, { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../store/auth';
// opcional: si querés reutilizar estilos base
// import './styles/Liquidaciones.css';

type Fund = { id: string; name: string };

type Estado = 'Pendiente' | 'Cobrado' | 'Baja';

type FacturaRow = {
  id: string;
  fund_id: string;
  client_id: string | null;
  client_name: string | null;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  monto_total: number;
  neto: number;
  iva: number;
  pdf_url: string | null;
  estado: Estado;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

type FacturaDetail = {
  id: string;
  fund_id: string;
  client_id: string | null;
  client_name: string | null;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  monto_total: number;
  neto: number;
  iva: number;
  pdf_url: string | null;
  estado: Estado;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

const fmtMoney = (n: number | undefined) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(n || 0));

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(new Date(iso));

const isAdminUser = (roles: string[] | undefined) => {
  const list = (roles ?? []).map((r) => String(r).toLowerCase());
  return list.includes('admin') || list.includes('owner');
};

/* ===================== UI pequeñas ===================== */

function EstadoPill({ estado }: { estado: Estado }) {
  const base = 'liq-status';
  const cls =
    estado === 'Cobrado'
      ? `${base} liq-status--closed`
      : estado === 'Baja'
      ? `${base} liq-status--hidden`
      : `${base} liq-status--open`;
  return <span className={cls}>{estado}</span>;
}

function LinkPDF({ href }: { href: string | null }) {
  if (!href) return <span className="liq-muted">—</span>;
  return (
    <a className="liq-link" href={href} target="_blank" rel="noopener noreferrer" title="Abrir PDF">
      PDF ↗
    </a>
  );
}

/* ===================== Modal Detalle ===================== */

function FacturaDetailModal({
  open,
  id,
  onClose,
  fundsById,
}: {
  open: boolean;
  id: string | null;
  onClose: () => void;
  fundsById: Record<string, string>;
}) {
  const [data, setData] = useState<FacturaDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      if (!open || !id) return;
      setLoading(true);
      try {
        const { data } = await api.get<FacturaDetail>(`/facturas/${id}`);
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

  return (
    <div className="liq-modal liq-modal--wide">
      <div className="liq-modal__dialog">
        <div className="liq-modal__header">
          <h3 className="liq-modal__title">Detalle de factura</h3>
          <button className="liq-icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="liq-modal__body">
          {loading && <div className="liq-empty">Cargando…</div>}
          {!loading && data && (
            <div className="liq-detail">
              {/* Cabecera */}
              <div className="liq-detail__headerGrid">
                <div><div className="liq-label">N°</div><div className="liq-value">{data.numero}</div></div>
                <div><div className="liq-label">Cliente</div><div className="liq-value">{data.client_name ?? '—'}</div></div>
                <div><div className="liq-label">Fondo</div><div className="liq-value">{fundsById[data.fund_id] ?? '—'}</div></div>
                <div><div className="liq-label">Emisión</div><div className="liq-value">{fmtDate(data.fecha_emision)}</div></div>
                <div><div className="liq-label">Vencimiento</div><div className="liq-value">{data.fecha_vencimiento ? fmtDate(data.fecha_vencimiento) : '—'}</div></div>
                <div><div className="liq-label">Estado</div><div className="liq-value"><EstadoPill estado={data.estado} /></div></div>
                <div><div className="liq-label">PDF</div><div className="liq-value"><LinkPDF href={data.pdf_url} /></div></div>
              </div>

              {/* KPIs */}
              <div className="liq-kpis">
                <div className="liq-kpi"><div className="liq-kpi__label">NETO</div><div className="liq-kpi__value">{fmtMoney(data.neto)}</div></div>
                <div className="liq-kpi"><div className="liq-kpi__label">IVA</div><div className="liq-kpi__value">{fmtMoney(data.iva)}</div></div>
                <div className="liq-kpi"><div className="liq-kpi__label">TOTAL</div><div className="liq-kpi__value">{fmtMoney(data.monto_total)}</div></div>
              </div>

              {/* Notas */}
              <div className="liq-card liq-card--span2">
                <div className="liq-card__title">Notas</div>
                <div className="liq-card__body">{data.notas?.trim() || <span className="liq-muted">Sin notas</span>}</div>
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

/* ===================== Página principal ===================== */

export default function FacturasPage() {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user?.roles);

  // Datos
  const [funds, setFunds] = useState<Fund[]>([]);
  const [rows, setRows] = useState<FacturaRow[]>([]);

  // Estado general
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filtros UI (read-only)
  const [q, setQ] = useState<string>('');
  const [estado, setEstado] = useState<Estado | 'Todos'>('Todos');
  const [fundId, setFundId] = useState<string>(''); // vacío = todos
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);

  // Detalle
  const [detailId, setDetailId] = useState<string | null>(null);

  const fundsById = useMemo(
    () => funds.reduce((acc, f) => ((acc[f.id] = f.name), acc), {} as Record<string, string>),
    [funds]
  );

  // Carga inicial: fondos visibles por RLS + primer página de facturas
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setLoading(true);
      setErr(null);
      try {
        const [fres, lres] = await Promise.all([
          api.get<Fund[]>('/funds'),
          api.get<FacturaRow[]>('/facturas', { params: { limit, offset } }),
        ]);
        if (!cancel) {
          setFunds(fres.data);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit,
        offset,
      };
      if (q.trim()) params.q = q.trim();
      if (estado !== 'Todos') params.estado = estado;
      if (fundId) params.fund_id = fundId;

      const { data } = await api.get<FacturaRow[]>('/facturas', { params });
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  // Cambiar página
  const nextPage = () => {
    setOffset((o) => o + limit);
  };
  const prevPage = () => {
    setOffset((o) => Math.max(0, o - limit));
  };

  // Cuando cambian offset/limit/filtros => refrescar
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, limit]);

  // Aplicar filtros manualmente
  const applyFilters = () => {
    setOffset(0);
    refresh();
  };

  // Columnas (reutilizo nombres estilo "liq-*" para heredar CSS si querés)
  const columns = useMemo(
    () => [
      { key: 'fecha', label: 'Emisión' },
      { key: 'numero', label: 'N°' },
      { key: 'cliente', label: 'Cliente' },
      ...(isAdmin ? [{ key: 'fondo', label: 'Fondo' }] : []),
      { key: 'neto', label: 'Neto' },
      { key: 'iva', label: 'IVA' },
      { key: 'total', label: 'Total' },
      { key: 'estado', label: 'Estado' },
      { key: 'pdf', label: 'PDF' },
      { key: 'acciones', label: '' },
    ],
    [isAdmin]
  );

  return (
    <div className="liq-page">
      <div className="liq-toolbar">
        <h2 className="liq-title">Facturas</h2>
      </div>

      {/* Filtros */}
      <div className="liq-filters">
        <input
          className="liq-input"
          placeholder="Buscar por número o cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          style={{ minWidth: 280 }}
        />
        <select className="liq-input" value={estado} onChange={(e) => setEstado(e.target.value as any)}>
          <option value="Todos">Todos los estados</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Cobrado">Cobrado</option>
          <option value="Baja">Baja</option>
        </select>
        <select className="liq-input" value={fundId} onChange={(e) => setFundId(e.target.value)}>
          <option value="">Todos los fondos</option>
          {funds.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <button className="liq-btn liq-btn--primary" onClick={applyFilters}>Aplicar</button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="liq-label" style={{ margin: 0 }}>Filas:</label>
          <select
            className="liq-input"
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[25, 50, 100, 200, 500].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button className="liq-btn liq-btn--soft" onClick={prevPage} disabled={offset === 0}>←</button>
          <button className="liq-btn liq-btn--soft" onClick={nextPage}>→</button>
        </div>
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
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.fecha_emision)}</td>
                  <td>{r.numero}</td>
                  <td>{r.client_name ?? '—'}</td>
                  {isAdmin && <td>{fundsById[r.fund_id] ?? '—'}</td>}
                  <td className="liq-td--money">{fmtMoney(r.neto)}</td>
                  <td className="liq-td--money">{fmtMoney(r.iva)}</td>
                  <td className="liq-td--money">{fmtMoney(r.monto_total)}</td>
                  <td><EstadoPill estado={r.estado} /></td>
                  <td><LinkPDF href={r.pdf_url} /></td>
                  <td className="liq-td--actions">
                    <button className="liq-icon-btn" title="Ver" onClick={() => setDetailId(r.id)}>👁️</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length}>
                    <div className="liq-empty">No hay facturas.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal detalle */}
      <FacturaDetailModal
        open={!!detailId}
        id={detailId}
        onClose={() => setDetailId(null)}
        fundsById={fundsById}
      />
    </div>
  );
}
