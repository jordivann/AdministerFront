// src/components/admin/Facturas.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import api, {
  isFacturaNumberValid,
  facturaTipo,
  prettyFactura,
} from '../../lib/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import './styles/providers.css';
import { FacturaNumberInput } from './FacturaNumberInput';

type Fund = { id: string; name: string };
type Client = { id: string; name: string };

type Invoice = {
  id: string;
  fund_id: string;
  client_id: string | null;
  client_name?: string | null;
  numero: string; // sin guiones (A000200001414)
  fecha_emision: string;
  fecha_vencimiento?: string | null;
  monto_total: number;
  neto: number;  // puede venir calculado por el back (A: neto; B/C: total)
  iva: number;   // puede venir calculado por el back (A: iva;  B/C: 0)
  pdf_url?: string | null;
  estado: 'Pendiente' | 'Cobrado' | 'Baja';
  notas?: string | null;
  created_at: string;
  updated_at: string;
};

type ModalState =
  | { open: false }
  | { open: true; mode: 'create' }
  | { open: true; mode: 'edit'; data: Invoice };

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(
    new Date(iso)
  );
}

/* ================== Modal ================== */
function InvoiceModal({
  state,
  onClose,
  onSaved,
  funds,
  clients,
}: {
  state: ModalState;
  onClose: () => void;
  onSaved: () => void;
  funds: Fund[];
  clients: Client[];
}) {
  if (!state.open) return null;
  const isEdit = state.mode === 'edit';
  const base = state.mode === 'edit' ? state.data : undefined;

  const [fundId, setFundId] = useState(base?.fund_id ?? funds[0]?.id ?? '');
  const [clientId, setClientId] = useState(base?.client_id ?? (clients[0]?.id ?? ''));
  const [numero, setNumero] = useState(base?.numero ?? '');
  const [fechaEmi, setFechaEmi] = useState<string>(
    base ? base.fecha_emision.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [fechaVen, setFechaVen] = useState<string>(
    base?.fecha_vencimiento ? base.fecha_vencimiento.slice(0, 10) : ''
  );
  const [monto, setMonto] = useState<string>(String(base?.monto_total ?? '0'));
  const [pdfUrl, setPdfUrl] = useState<string>(base?.pdf_url ?? '');
  const [estado, setEstado] = useState<Invoice['estado']>(base?.estado ?? 'Pendiente');
  const [notas, setNotas] = useState<string>(base?.notas ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!state.open) return;
    if (isEdit && base) {
      setFundId(base.fund_id);
      setClientId(base.client_id ?? '');
      setNumero(base.numero);
      setFechaEmi(base.fecha_emision.slice(0, 10));
      setFechaVen(base.fecha_vencimiento ? base.fecha_vencimiento.slice(0, 10) : '');
      setMonto(String(base.monto_total));
      setPdfUrl(base.pdf_url ?? '');
      setEstado(base.estado);
      setNotas(base.notas ?? '');
    } else {
      setFundId(funds[0]?.id ?? '');
      setClientId(clients[0]?.id ?? '');
      setNumero('');
      setFechaEmi(new Date().toISOString().slice(0, 10));
      setFechaVen('');
      setMonto('0');
      setPdfUrl('');
      setEstado('Pendiente');
      setNotas('');
    }
    setErr(null);
  }, [state.open, isEdit, base?.id, funds, clients]);

  const save = async () => {
    if (!fundId) return setErr('Fondo requerido');
    if (!clientId) return setErr('Cliente requerido');
    if (!isFacturaNumberValid(numero)) {
      setErr('Ingresá un número de factura válido (A/B/C + 4 + 8).');
      return;
    }
    if (Number.isNaN(Number(monto))) return setErr('Monto inválido');

    setSaving(true);
    setErr(null);
    try {
      const payload = {
        fund_id: fundId,
        client_id: clientId,
        numero: numero.trim(),
        fecha_emision: fechaEmi,
        fecha_vencimiento: fechaVen || null,
        monto_total: Number(monto),
        pdf_url: pdfUrl?.trim() || null,
        estado,
        notas: notas?.trim() || null,
      };
      if (isEdit && base) {
        await api.patch(`/facturas/${base.id}`, payload);
      } else {
        await api.post('/facturas', payload);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="prv-modal">
      <div className="prv-modal__dialog">
        <div className="prv-modal__header">
          <h3 className="prv-modal__title">{isEdit ? 'Editar factura' : 'Nueva factura'}</h3>
          <button className="prv-iconbtn" onClick={onClose}>✕</button>
        </div>

        {err && <div className="prv-alert prv-alert--error">{err}</div>}

        <div className="prv-modal__body">
          <div className="prv-form">
            <div className="prv-row">
              <label>Fondo</label>
              <select className="prv-inp" value={fundId} onChange={(e)=>setFundId(e.target.value)}>
                {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>

            <div className="prv-row">
              <label>Cliente</label>
              <select className="prv-inp" value={clientId} onChange={(e)=>setClientId(e.target.value)}>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="prv-grid">
              <div className="prv-col">
                <label>Número *</label>
                <FacturaNumberInput value={numero} onChange={setNumero} />
              </div>
            </div>
            <div className="prv-grid">
              <div className="prv-col">
                <label>Monto total *</label>
                <input className="prv-inp" type="number" step="0.01" value={monto} onChange={(e)=>setMonto(e.target.value)} />
              </div>
            </div>

            <div className="prv-grid">
              <div className="prv-col">
                <label>Emisión</label>
                <input className="prv-inp" type="date" value={fechaEmi} onChange={(e)=>setFechaEmi(e.target.value)} />
              </div>
              <div className="prv-col">
                <label>Vencimiento</label>
                <input className="prv-inp" type="date" value={fechaVen} onChange={(e)=>setFechaVen(e.target.value)} />
              </div>
            </div>

            <div className="prv-row">
              <label>PDF (URL)</label>
              <input className="prv-inp" placeholder="https://…" value={pdfUrl} onChange={(e)=>setPdfUrl(e.target.value)} />
            </div>

            <div className="prv-row">
              <label>Estado</label>
              <select className="prv-inp" value={estado} onChange={(e)=>setEstado(e.target.value as Invoice['estado'])}>
                <option>Pendiente</option>
                <option>Cobrado</option>
                <option>Baja</option>
              </select>
            </div>

            <div className="prv-row">
              <label>Notas</label>
              <textarea className="prv-inp" rows={3} value={notas} onChange={(e)=>setNotas(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="prv-modal__footer">
          <button className="prv-btn prv-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="prv-btn prv-btn--primary" disabled={saving} onClick={save}>
            {isEdit ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================== Página ================== */
export default function AdminFacturas() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [estado, setEstado] = useState<Invoice['estado'] | 'Todos'>('Todos');
  const [fundFilter, setFundFilter] = useState<string>('Todos');

  const debounced = useDebouncedValue(query, 250);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpenIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const [modal, setModal] = useState<ModalState>({ open: false });

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [fres, cres, lres] = await Promise.all([
        api.get<Fund[]>('/funds'),
        api.get<Client[]>('/clients'),
        api.get<Invoice[]>('/facturas', {
          params: {
            q: debounced || undefined,
            estado: estado === 'Todos' ? undefined : estado,
            fund_id: fundFilter === 'Todos' ? undefined : fundFilter,
          },
        }),
      ]);
      setFunds(fres.data);
      setClients(cres.data);
      setRows(lres.data);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e.message ?? 'No se pudo obtener facturas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, estado, fundFilter]);

  const onDelete = async (id: string) => {
    if (!confirm('¿Borrar factura?')) return;
    try {
      await api.delete(`/facturas/${id}`);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e.message ?? 'No se pudo borrar');
    }
  };

  const fundsById = useMemo(() => {
    const m: Record<string, string> = {};
    funds.forEach((f) => (m[f.id] = f.name));
    return m;
  }, [funds]);

  const countInfo = `${rows.length} facturas${loading ? ' (cargando...)' : ''}`;

  return (
    <div className="prv-root">
      <div className="prv-header">
        <h2 className="prv-title">Facturas</h2>
        <div className="prv-count">{countInfo}</div>
      </div>

      {/* Filtros */}
      <div className="prv-filters">
        <label className="prv-lbl" htmlFor="f-search">
          Buscar
        </label>
        <div className="prv-searchwrap">
          <input
            id="f-search"
            ref={searchRef}
            className="prv-inp"
            placeholder="Número, cliente o notas… (⌘/Ctrl K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="prv-btn prv-btn--ghost prv-clear"
              onClick={() => setQuery('')}
            >
              Limpiar
            </button>
          )}
        </div>

        <div className="prv-row" style={{ minWidth: 220 }}>
          <label>Estado</label>
          <select
            className="prv-inp"
            value={String(estado)}
            onChange={(e) => setEstado(e.target.value as any)}
          >
            <option value="Todos">Todos</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Cobrado">Cobrado</option>
            <option value="Baja">Baja</option>
          </select>
        </div>

        <div className="prv-row" style={{ minWidth: 220 }}>
          <label>Fondo</label>
          <select
            className="prv-inp"
            value={fundFilter}
            onChange={(e) => setFundFilter(e.target.value)}
          >
            <option value="Todos">Todos</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1 }} />

        <button
          className="prv-btn prv-btn--primary"
          onClick={() => setModal({ open: true, mode: 'create' })}
        >
          + Nueva
        </button>
      </div>

      {err && <div className="prv-error">Error: {err}</div>}

      {/* Lista */}
      <div className="prv-list">
        {rows.map((inv) => {
          const isOpen = openIds.has(inv.id);
          const tipo = facturaTipo(inv.numero); // 'A' | 'B' | 'C' | null
          const showAsA = tipo === 'A';
          const netoDisp = showAsA ? inv.neto : inv.monto_total;
          const ivaDisp = showAsA ? inv.iva : 0;

          return (
            <div key={inv.id} className={`prv-item ${isOpen ? 'open' : ''}`}>
              <button
                className="prv-row"
                onClick={() => toggle(inv.id)}
                onDoubleClick={() => setModal({ open: true, mode: 'edit', data: inv })}
                aria-expanded={isOpen}
                title="Doble click para editar"
              >
                <div className="prv-row-main">
                  <div className="prv-name">
                    {prettyFactura(inv.numero)} — {inv.client_name ?? ''}
                    <span style={{ marginLeft: 8, opacity: 0.6 }}>
                      ({fmtDate(inv.fecha_emision)})
                    </span>
                  </div>
                  <div className="prv-meta">
                    <span className="prv-pill" title="Fondo">
                      {fundsById[inv.fund_id] ?? '—'}
                    </span>
                    <span
                      className={`prv-badge ${
                        inv.estado === 'Cobrado'
                          ? 'ok'
                          : inv.estado === 'Baja'
                          ? 'warn'
                          : ''
                      }`}
                    >
                      {inv.estado}
                    </span>
                    <span className="prv-chip" title="Total">
                      {fmtMoney(inv.monto_total)}
                    </span>
                  </div>
                </div>
                <div className="prv-caret" aria-hidden>
                  ▾
                </div>
              </button>

              {isOpen && (
                <div className="prv-detail">
                  <div className="prv-grid">
                    {showAsA ? (
                      <>
                        <div className="prv-col">
                          <div className="prv-dt">Neto</div>
                          <div className="prv-dd">{fmtMoney(netoDisp)}</div>
                        </div>
                        <div className="prv-col">
                          <div className="prv-dt">IVA</div>
                          <div className="prv-dd">{fmtMoney(ivaDisp)}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="prv-col">
                          <div className="prv-dt">Total (B/C)</div>
                          <div className="prv-dd">{fmtMoney(netoDisp)}</div>
                        </div>
                        <div className="prv-col">
                          <div className="prv-dt">IVA</div>
                          <div className="prv-dd">—</div> {/* si preferís, poné {fmtMoney(0)} */}
                        </div>
                      </>
                    )}

                    <div className="prv-col">
                      <div className="prv-dt">Vencimiento</div>
                      <div className="prv-dd">{fmtDate(inv.fecha_vencimiento)}</div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">PDF</div>
                      <div className="prv-dd">
                        {inv.pdf_url ? <a href={inv.pdf_url} target="_blank" rel="noreferrer">Ver PDF</a> : '—'}
                      </div>
                    </div>
                  </div>


                  {inv.notas && (
                    <div className="prv-note">
                      <div className="prv-dt">Notas</div>
                      <div className="prv-dd">{inv.notas}</div>
                    </div>
                  )}

                  <div className="prv-detail-actions">
                    <button
                      className="prv-btn"
                      onClick={() => setModal({ open: true, mode: 'edit', data: inv })}
                    >
                      Editar
                    </button>
                    <button
                      className="prv-btn prv-btn--danger"
                      onClick={() => onDelete(inv.id)}
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!loading && rows.length === 0 && (
          <div className="prv-empty">
            <div className="prv-empty-title">Sin facturas</div>
            <div className="prv-empty-desc">Creá la primera con “+ Nueva”.</div>
          </div>
        )}
      </div>

      <InvoiceModal
        state={modal}
        onClose={() => setModal({ open: false })}
        onSaved={load}
        funds={funds}
        clients={clients}
      />
    </div>
  );
}
