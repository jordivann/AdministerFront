// src/pages/Home.tsx
import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth, useIsAdmin } from '../store/auth';
import './styles/Home.css';
import HelpTips from '../components/ui/HelpTips';

type Fund = { id: string; name: string; is_active: boolean };

type Tx = {
  id: string;
  tx_date: string;            // 'YYYY-MM-DD'
  description?: string | null;
  amount: number;             // positivo en origen; firmamos local con 'type'
  type?: 'credit' | 'debit';  // si no viene, inferimos por el signo
  fund_id: string;
  account_id?: string;
  category_id?: string | null;
};

type RangeKey = '30d' | 'thisMonth' | '90d' | 'all';
type TypeKey = 'all' | 'credit' | 'debit';

const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');  // YYYY-MM-DD -> DD/MM/YYYY
  return `${d}/${m}/${y}`;
};

function signedAmount(tx: Tx): number {
  const base = Math.abs(tx.amount);
  if (tx.type === 'credit') return base;
  if (tx.type === 'debit') return -base;
  return tx.amount >= 0 ? base : -base; // fallback si ya viene firmado
}

function getRangeDates(key: RangeKey): { from?: Date; to?: Date } {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (key === 'all') return {};
  if (key === '30d') {
    const start = new Date(end); start.setDate(end.getDate() - 30);
    return { from: start, to: end };
  }
  if (key === '90d') {
    const start = new Date(end); start.setDate(end.getDate() - 90);
    return { from: start, to: end };
  }
  const start = new Date(end.getFullYear(), end.getMonth(), 1); // thisMonth
  return { from: start, to: end };
}

function toYYYYMMDD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Home() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const roles = user?.roles ?? [];
  const isAdministerView = isAdmin || roles.includes('owner') || roles.includes('contador');

  const [funds, setFunds] = useState<Fund[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filtros locales
  const [q, setQ] = useState('');
  const [fundFilter, setFundFilter] = useState<'all' | string>('all');
  const [typeFilter, setTypeFilter] = useState<TypeKey>('all');
  const [range, setRange] = useState<RangeKey>('30d');
  const [includeShared, setIncludeShared] = useState<boolean>(true); // incluir "Comunes" cuando se filtra por un fondo

  // Carga inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [fundsRes, txRes] = await Promise.all([
          api.get<Fund[]>('/funds'),
          api.get<Tx[]>('/transactions', {
            params: {
              from: toYYYYMMDD(new Date(Date.now() - 90 * 24 * 3600 * 1000)), // 90 días
              limit: 2000,
            }
          })
        ]);
        if (!cancelled) {
          setFunds(fundsRes.data);
          setTxs(txRes.data);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.response?.data?.error ?? e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fundById = useMemo(() => {
    const map = new Map<string, Fund>();
    funds.forEach(f => map.set(f.id, f));
    return map;
  }, [funds]);

  const sharedFund = useMemo(() => {
    return funds.find(f => f.name?.trim().toLowerCase() === 'comunes');
  }, [funds]);

  // Ordenamos: preferencia por La Rioja / Los pipinos, luego el resto, y "Comunes" va aparte
  const mainFunds = useMemo(() => {
    const priority = ['la rioja', 'los pipinos'];
    const isShared = (f: Fund) => f.name?.trim().toLowerCase() === 'comunes';
    const list = funds.filter(f => !isShared(f));
    const score = (f: Fund) => {
      const i = priority.indexOf(f.name.trim().toLowerCase());
      return i >= 0 ? i : 99; // los prioritarios primero
    };
    return [...list].sort((a, b) => {
      const sa = score(a), sb = score(b);
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name, 'es');
    });
  }, [funds]);

  const rangeDates = useMemo(() => getRangeDates(range), [range]);

  const filtered = useMemo(() => {
    const sharedId = sharedFund?.id;
    return txs.filter(tx => {
      // rango
      if (rangeDates.from || rangeDates.to) {
        const d = new Date(tx.tx_date + 'T00:00:00');
        if (rangeDates.from && d < rangeDates.from) return false;
        if (rangeDates.to && d > rangeDates.to) return false;
      }
      // fondo (con opción de incluir "Comunes")
      if (fundFilter !== 'all') {
        const isSelected = tx.fund_id === fundFilter;
        const isShared = sharedId && tx.fund_id === sharedId;
        if (!isSelected) {
          if (!(includeShared && isShared && fundFilter !== sharedId)) return false;
        }
      }
      // tipo
      if (typeFilter !== 'all') {
        const sign = signedAmount(tx) >= 0 ? 'credit' : 'debit';
        if (sign !== typeFilter) return false;
      }
      // texto
      if (q.trim()) {
        const hay = (tx.description || '').toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [txs, rangeDates, fundFilter, typeFilter, q, includeShared, sharedFund?.id]);

  // Totales (sobre lo filtrado)
  const totals = useMemo(() => {
    let credits = 0, debits = 0;
    for (const tx of filtered) {
      const v = signedAmount(tx);
      if (v >= 0) credits += v; else debits += Math.abs(v);
    }
    const net = credits - debits; // saldo (neto)
    return { credits, debits, net };
  }, [filtered]);

  // Totales por fondo (para stats en las cards)
  const byFund = useMemo(() => {
    const agg = new Map<string, { name: string; count: number; net: number }>();
    for (const f of funds) agg.set(f.id, { name: f.name, count: 0, net: 0 });
    for (const tx of filtered) {
      const id = tx.fund_id;
      if (!agg.has(id)) continue;
      const row = agg.get(id)!;
      row.count += 1;
      row.net += signedAmount(tx);
    }
    return Array.from(agg.entries()).map(([fund_id, v]) => ({ fund_id, ...v }));
  }, [filtered, funds]);
  
  // Helpers para stats por fondo
  const statsFor = (fundId?: string) => byFund.find(x => x.fund_id === fundId);
  const comunesNetAbs = Math.abs(statsFor(sharedFund?.id ?? '')?.net ?? 0);
  const comunesNetEn2 = comunesNetAbs/2;
  const shouldHalfForTotals = !isAdministerView && fundFilter === 'all';
  const netToShow = shouldHalfForTotals ? (totals.net + comunesNetEn2) : totals.net;
  const netNote = shouldHalfForTotals
    ? `Ajustado por Comunes (1/2): ${fmtARS.format(comunesNetEn2)}`
    : 'Consolidado (incluye Comunes completos)';

  const adjustedNet = (fundId: string, baseNet: number) => {
    const n = (fundById.get(fundId)?.name ?? '').trim().toLowerCase();
    return (n === 'la rioja' || n === 'los pipinos')
      ? baseNet - (comunesNetAbs / 2)   // usar neto de comunes / 2
      : baseNet;
  };

  return (
    <div className="home-dash-page">
      <section className="home-dash-hero">
        <h1 className="home-dash-hero-title">Resumen</h1>
        {isAdmin && (<p className="home-dash-hero-subtitle">Vistas de solo lectura — fondos habilitados por RLS</p>)}
      </section>

      <HelpTips
        position="bottom-right"
        autoHideMs={10000}
        tips={[
          'Podés filtrar por tipo y por rango sin recargar.',
          'Saldo (Neto) = Ingresos (Créditos) – Egresos (Débitos).',
          'Usá “Incluir Comunes” para sumar el fondo compartido cuando filtrás por un fondo propio.'
        ]}
      />

      {loading && <div className="home-dash-skeleton home-dash-skeleton--panel">Cargando datos…</div>}
      {err && <div className="home-dash-alert home-dash-alert--error">Error: {err}</div>}

      {!loading && !err && (
        <>
          {/* Fondos visibles */}
          <section className="home-dash-section">
            {isAdmin && (
             <h2 className="home-dash-section-title">Tus fondos</h2>             
            )}

            {/* Fondos principales (grandes) */}
            {mainFunds.length === 0 ? (
              <div className="home-dash-empty">No tenés fondos visibles.</div>
            ) : (
              <div className="home-dash-grid home-dash-grid--funds">
                {mainFunds.map(f => {
                  const stat = statsFor(f.id);
                  const net  = adjustedNet(f.id, stat?.net ?? 0);   // 👈 acá

                  return (
                    <article key={f.id} className="home-dash-fund-card">
                      <header className="home-dash-fund-card__header">
                        <h3 className="home-dash-fund-card__name">{f.name}</h3>
                      </header>
                      <div className="home-dash-fund-card__body">
                        <div className="home-dash-fund-card__stat">
                          <span className="home-dash-fund-card__label">
                            Neto
                          </span>
                          <strong className={`home-dash-fund-card__value ${net >= 0 ? 'home-dash-amount--pos' : 'home-dash-amount--neg'}`}>
                            {fmtARS.format(net)}
                          </strong>
                        </div>
                      </div>
                    </article>
                  );
                })}

              </div>
            )}

            {/* “Comunes” (pequeña, debajo) */}
            {sharedFund && (
              <div className="home-dash-grid home-dash-grid--shared">
                <article className="home-dash-fund-card home-dash-fund-card--shared">
                  <header className="home-dash-fund-card__header">
                    <h3 className="home-dash-fund-card__name">{sharedFund.name}</h3>
                    {/* <span className={`home-dash-status-badge ${sharedFund.is_active ? 'home-dash-status-badge--ok' : 'home-dash-status-badge--off'}`}>
                      {sharedFund.is_active ? 'Activo' : 'Inactivo'}
                    </span> */}
                  </header>
                  <div className="home-dash-fund-card__body">
                    {/* <div className="home-dash-fund-card__stat">
                      <span className="home-dash-fund-card__label">Movs.</span>
                      <strong className="home-dash-fund-card__value">{statsFor(sharedFund.id)?.count ?? 0}</strong>
                    </div> */}
                    <div className="home-dash-fund-card__stat">
                      <span className="home-dash-fund-card__label">Neto</span>
                      <strong className={`home-dash-fund-card__value ${ (statsFor(sharedFund.id)?.net ?? 0) >= 0 ? 'home-dash-amount--pos' : 'home-dash-amount--neg'}`}>
                        
                          {fmtARS.format(Number(comunesNetEn2 ?? 0))}
                        

                      </strong>
                    </div>
                  </div>
                </article>
              </div>
            )}
          </section>

          {/* Totalizadores (Saldo primero) */}
          <section className="home-dash-section">
            <h2 className="home-dash-section-title">Totalizadores</h2>
            <div className="home-dash-grid home-dash-grid--metrics">
              <div className="home-dash-metric-card">
                <span className="home-dash-metric-card__label">
                  SALDO (NETO){' '}
                  <small style={{opacity:.7}}> {netNote}</small>
                </span>
                <strong className={`home-dash-metric-card__value ${netToShow >= 0 ? 'home-dash-amount--pos' : 'home-dash-amount--neg'}`}>
                  {fmtARS.format(
                    netToShow
                  )}
                </strong>

              </div>
              <div className="home-dash-metric-card">
                <span className="home-dash-metric-card__label">Ingresos (Créditos)</span>
                <strong className="home-dash-metric-card__value">{fmtARS.format(totals.credits)}</strong>
              </div>
              <div className="home-dash-metric-card">
                <span className="home-dash-metric-card__label">Egresos (Débitos)</span>
                <strong className="home-dash-metric-card__value">{fmtARS.format(totals.debits)}</strong>
              </div>
            </div>
          </section>

          {/* Filtros + Tabla */}
          <section className="home-dash-section">
            <h2 className="home-dash-section-title">Movimientos</h2>

            <div className="home-dash-filters">
              <div className="home-dash-filter">
                <label>Búsqueda</label>
                <input
                  className="home-dash-input"
                  placeholder="Descripción contiene…"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
              </div>

              {/* Fondo solo para admins */}
              {isAdmin && (
                <div className="home-dash-filter">
                  <label>Fondo</label>
                  <select
                    className="home-dash-input"
                    value={fundFilter}
                    onChange={e => setFundFilter(e.target.value)}
                  >
                    <option value="all">Todos</option>
                    {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}

              {/* Toggle incluir “Comunes” (si hay filtro por fondo y existe Comunes) */}
              {isAdmin && fundFilter !== 'all' && sharedFund && fundFilter !== sharedFund.id && (
                <div className="home-dash-filter home-dash-include-shared">
                  <label className="home-dash-switch">
                    <input
                      type="checkbox"
                      checked={includeShared}
                      onChange={e => setIncludeShared(e.target.checked)}
                    />
                    <span className="home-dash-switch__track" aria-hidden></span>
                    <span className="home-dash-switch__label">Incluir “{sharedFund.name}”</span>
                  </label>
                </div>
              )}

              <div className="home-dash-filter">
                <label>Tipo</label>
                <select
                  className="home-dash-input"
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value as TypeKey)}
                >
                  <option value="all">Todos</option>
                  <option value="credit">Créditos</option>
                  <option value="debit">Débitos</option>
                </select>
              </div>

              <div className="home-dash-filter">
                <label>Rango</label>
                <select
                  className="home-dash-input"
                  value={range}
                  onChange={e => setRange(e.target.value as RangeKey)}
                >
                  <option value="30d">Últimos 30 días</option>
                  <option value="thisMonth">Este mes</option>
                  <option value="90d">Últimos 90 días</option>
                  <option value="all">Todo (cargado)</option>
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="home-dash-empty">Sin resultados para los filtros aplicados.</div>
            ) : (
              <div className="home-dash-table-wrap">
                <table className="home-dash-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      {isAdmin && (<th>Fondo</th>)}
                      <th>Descripción</th>
                      <th className="home-dash-amount-col">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(tx => {
                      const fund = fundById.get(tx.fund_id);
                      const isComunes = !isAdmin && fund?.name?.trim().toLowerCase() === 'comunes';

                      const desc = (tx.description ?? '').trim();
                      const descLabel = isComunes
                        ? (desc ? `${desc} - (Comunes)` : '(Comunes)')
                        : (desc || '—');

                      const v = signedAmount(tx);

                      return (
                        <tr key={tx.id}>
                          <td>{fmtDate(tx.tx_date)}</td>
                          {isAdmin && <td>{fund?.name ?? '—'}</td>}
                          <td>{descLabel}</td>
                          <td className={`home-dash-amount-col ${v >= 0 ? 'home-dash-amount--pos' : 'home-dash-amount--neg'}`}>
                            {fmtARS.format(v)}
                          </td>
                        </tr>
                      );
                    })}

                  </tbody>
                </table>
                {filtered.length > 1000 && (
                  <div className="home-dash-hint">
                    Mostrando {filtered.length} filas. Afiná los filtros para una lectura más cómoda.
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
