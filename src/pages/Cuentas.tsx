// src/pages/cuentas.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../store/auth';
import Loader from '../components/ui/Loader';

type Cuenta = {
  id: string;
  name: string;
  monto: number;
  fecha_actualizacion: string; // ISO
  pdf_url?: string | null;     // NUEVO
};

const fmtMoney = (n: number | undefined) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(n || 0));

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

const isAdminUser = (roles?: string[]) => {
  const r = (roles ?? []).map((x) => String(x).toLowerCase());
  return r.includes('admin') || r.includes('owner');
};
const isGalponUser = (roles?: string[]) => {
  const r = (roles ?? []).map((x) => String(x).toLowerCase());
  return r.includes('Galpon');
};

function timeAgo(iso?: string) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.max(1, Math.floor(ms / 1000));
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  const d = Math.floor(hr / 24);
  return `hace ${d}d`;
}

export default function CuentasEstado() {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user?.roles);
  const isGalpon = isGalponUser(user?.roles);

  const [rows, setRows] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Query/paginación simple
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // debounce búsqueda
  const debTimer = useRef<number | null>(null);
  const [debQ, setDebQ] = useState('');

  const doSearchDebounced = (value: string) => {
    setQ(value);
    if (debTimer.current) window.clearTimeout(debTimer.current);
    debTimer.current = window.setTimeout(() => setDebQ(value), 300);
  };

  const fetchPage = async (reset = false) => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get<Cuenta[]>('/cuentas-lospipinos', {
        params: {
          q: debQ || undefined,
          limit,
          offset: reset ? 0 : offset,
        },
      });
      if (reset) {
        setRows(data);
      } else {
        setRows((prev) => [...prev, ...data]);
      }
      setHasMore(data.length >= limit);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e.message ?? 'Error';
      setErr(msg);
      if (e?.response?.status === 403) setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Cargar al montar y cuando cambia debQ (búsqueda)
  useEffect(() => {
    setOffset(0);
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debQ, limit]);

  // Cargar más
  const loadMore = async () => {
    const next = offset + limit;
    setOffset(next);
    try {
      const { data } = await api.get<Cuenta[]>('/cuentas-lospipinos', {
        params: { q: debQ || undefined, limit, offset: next },
      });
      setRows((prev) => [...prev, ...data]);
      setHasMore(data.length >= limit);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e.message ?? 'Error');
    }
  };

  const refresh = () => {
    setOffset(0);
    fetchPage(true);
  };

  // KPIs
  const { totalCuentas, sumaMontos, ultimaActualizacion } = useMemo(() => {
    const total = rows.length;
    const suma = rows.reduce((acc, r) => acc + Number(r.monto || 0), 0);
    const maxDate = rows.reduce<string | null>((max, r) => {
      const d = r.fecha_actualizacion;
      if (!max) return d;
      return new Date(d) > new Date(max) ? d : max;
    }, null);
    return { totalCuentas: total, sumaMontos: suma, ultimaActualizacion: maxDate };
  }, [rows]);

  return (
    <div className="cuentas-page" style={{ padding: 24 }}>
      <div className="cuentas-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Cuentas — Estado</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="cuentas-input"
            placeholder="Buscar por nombre…"
            value={q}
            onChange={(e) => doSearchDebounced(e.target.value)}
            style={{
              height: 36,
              borderRadius: 12,
              padding: '0 12px',
              border: '1px solid rgba(60,60,67,0.18)',
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'saturate(180%) blur(20px)',
              WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            }}
          />
          <button
            className="cuentas-btn cuentas-btn--primary"
            onClick={refresh}
            style={{
              height: 36,
              borderRadius: 12,
              padding: '0 12px',
              border: '1px solid rgba(60,60,67,0.18)',
              background: '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
              cursor: 'pointer',
            }}
            title="Refrescar"
          >
            ↻ Refrescar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div
        className="cuentas-kpis"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="cuentas-kpi" style={kpiStyle()}>
          <div className="cuentas-kpi__label">TOTAL CUENTAS</div>
          <div className="cuentas-kpi__value">{totalCuentas}</div>
        </div>
        <div className="cuentas-kpi" style={kpiStyle()}>
          <div className="cuentas-kpi__label">SUMA DE MONTOS</div>
          <div className="cuentas-kpi__value">{fmtMoney(sumaMontos)}</div>
        </div>
        <div className="cuentas-kpi" style={kpiStyle()}>
          <div className="cuentas-kpi__label">ÚLTIMA ACTUALIZACIÓN</div>
          <div className="cuentas-kpi__value">
            {ultimaActualizacion ? `${fmtDate(ultimaActualizacion)} · ${timeAgo(ultimaActualizacion)}` : '—'}
          </div>
        </div>
      </div>

      {/* Mensajes */}
      {err && (
        <div
          className="cuentas-error"
          style={{
            marginBottom: 12,
            border: '1px solid rgba(255,59,48,0.25)',
            color: '#ff3b30',
            borderRadius: 12,
            padding: 12,
            background: 'rgba(255,59,48,0.06)',
          }}
        >
          {err}
        </div>
      )}

      {/* Tabla */}
      <div
        className="cuentas-tableWrap"
        style={{
          background: 'rgba(255,255,255,0.9)',
          border: '1px solid rgba(60,60,67,0.12)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
        }}
      >
        <table className="cuentas-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)' }}>
            <tr>
              <th style={thStyle}>Nombre</th>
              <th style={thStyle}>Monto</th>
              <th style={thStyle}>Actualizado</th>
              <th style={thStyle}>PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isPos = Number(r.monto) > 0;
              const isNeg = Number(r.monto) < 0;
              return (
                <tr key={r.id} className="cuentas-row" style={{ borderTop: '1px solid rgba(60,60,67,0.08)' }}>
                  <td style={tdStyle}>{r.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: isPos ? '#34c759' : isNeg ? '#ff3b30' : '#1c1c1e',
                      }}
                    >
                      {fmtMoney(r.monto)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{fmtDate(r.fecha_actualizacion)}</span>
                      <span style={{ fontSize: 12, color: '#8e8e93' }}>{timeAgo(r.fecha_actualizacion)}</span>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {r.pdf_url ? (
                      <a href={r.pdf_url} target="_blank" rel="noopener noreferrer">Ver PDF</a>
                    ) : (
                      <span style={{ opacity: 0.6 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div style={{ padding: 24, textAlign: 'center', color: '#8e8e93' }}>
                    No hay cuentas para mostrar.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación simple */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <button
          className="cuentas-btn"
          disabled={loading || !hasMore}
          onClick={loadMore}
          style={{
            height: 40,
            minWidth: 140,
            borderRadius: 12,
            padding: '0 14px',
            border: '1px solid rgba(60,60,67,0.18)',
            background: '#fff',
            cursor: loading || !hasMore ? 'not-allowed' : 'pointer',
            opacity: loading || !hasMore ? 0.6 : 1,
          }}
        >
          {loading ? <Loader/> : hasMore ? 'Cargar más' : 'No hay más'}
        </button>
      </div>
    </div>
  );
}

/* ====== estilos inline reutilizables ====== */
function kpiStyle(): React.CSSProperties {
  return {
    border: '1px solid rgba(60,60,67,0.12)',
    borderRadius: 16,
    padding: 16,
    background: 'rgba(255,255,255,0.85)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
  };
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '-0.01em',
  color: '#1c1c1e',
  borderBottom: '1px solid rgba(60,60,67,0.12)',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 14,
  color: '#1c1c1e',
};
