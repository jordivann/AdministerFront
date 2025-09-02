// src/components/admin/PaymentsAdmin.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../lib/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import './styles/providers.css';
import { id } from 'date-fns/locale';

type Fund = { id: string; name: string };
type Provider = { id: string; name: string };

type Payment = {
  id: string;
  fund_id: string;
  provider_id: string | null;
  provider_name?: string | null;

  fecha: string;       // ISO date (YYYY-MM-DD o full ISO)
  monto: number;

  medio?: string | null;         // transferencia, efectivo, etc.
  comprobante?: string | null;   // nro operación
  pdf_url?: string | null;

  estado: 'Pendiente' | 'Confirmado' | 'Anulado';
  notas?: string | null;

  created_at: string;
  updated_at: string;
};

type ModalState =
  | { open: false }
  | { open: true; mode: 'create' }
  | { open: true; mode: 'edit'; data: Payment };


  // Convierte cualquier shape que venga del API al shape Payment que usamos en la UI
function normalizePaymentRow(p: any): Payment {
  return {
    id: p.id,
    fund_id: p.fund_id,
    provider_id: p.provider_id ?? p.provider?.id ?? null,
    provider_name: p.provider_name ?? p.provider?.name ?? null,

    // fecha/monto con fallback
    fecha: String(p.fecha ?? p.fecha_emision ?? p.created_at ?? ''),
    monto: Number(p.monto ?? p.monto_total ?? 0),

    // alias comunes
    medio: p.medio ?? p.metodo_pago ?? null,
    comprobante: p.comprobante ?? null,
    pdf_url: p.pdf_url ?? p.comprobante_url ?? null,

    estado: (p.estado ?? 'Pendiente') as Payment['estado'],
    notas: p.notas ?? null,

    created_at: p.created_at ?? String(p.fecha ?? p.fecha_emision ?? new Date().toISOString()),
    updated_at: p.updated_at ?? String(new Date().toISOString()),
  };
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(iso));
}

/* =============== Modal =============== */
/* =============== Modal =============== */
function PaymentModal({
  state,
  onClose,
  onSaved,
  funds,
  providers,
}: {
  state: ModalState;
  onClose: () => void;
  onSaved: () => void;
  funds: Fund[];
  providers: Provider[];
}) {
  if (!state.open) return null;

  const isEdit = state.mode === 'edit';
  const base = isEdit ? state.data : undefined;

  // Helpers defensivos (soporta fecha vs fecha_emision, etc.)
  const getBaseFecha = () =>
    (base as any)?.fecha ?? (base as any)?.fecha_emision ?? null;
  const getBaseMonto = () =>
    (base as any)?.monto ?? (base as any)?.monto_total ?? 0;
  const getBaseMedio = () =>
    (base as any)?.medio ?? (base as any)?.metodo_pago ?? '';
  const getBaseComprobante = () =>
    (base as any)?.comprobante ?? '';
  const getBasePdfUrl = () =>
    (base as any)?.pdf_url ?? (base as any)?.comprobante_url ?? '';

  // Estado del form (sin .slice sobre undefined)
  const [fundId, setFundId] = useState(base?.fund_id ?? funds[0]?.id ?? '');
  const [providerId, setProviderId] = useState(base?.provider_id ?? (providers[0]?.id ?? ''));
  const [fecha, setFecha] = useState<string>(
    getBaseFecha() ? String(getBaseFecha()).slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [monto, setMonto] = useState<string>(String(getBaseMonto()));
  const [medio, setMedio] = useState<string>(getBaseMedio());
  const [comprobante, setComprobante] = useState<string>(getBaseComprobante());
  const [pdfUrl, setPdfUrl] = useState<string>(getBasePdfUrl());
  const [estado, setEstado] = useState<Payment['estado']>(base?.estado ?? 'Pendiente');
  const [notas, setNotas] = useState<string>(base?.notas ?? '');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Upload PDF (opcional)
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileToUpload(e.target.files?.[0] ?? null);
  };
  const uploadPdf = async () => {
    if (!isEdit || !base) return;
    if (!fileToUpload) return setErr('Elegí un PDF primero.');
    if (fileToUpload.type !== 'application/pdf') return setErr('Solo PDFs');

    setSaving(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', fileToUpload);
      const { data } = await api.get<any>(`/payments/${id}`);
    setModal({ open: true, mode: 'edit', data: normalizePaymentRow(data) });
      setPdfUrl(data.pdf_url ?? '');
      setFileToUpload(null);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e.message ?? 'No se pudo subir el PDF');
    } finally {
      setSaving(false);
    }
  };

  // Reset al abrir/cambiar modo (sin .slice directo)
  useEffect(() => {
    if (!state.open) return;
    if (isEdit && base) {
      setFundId(base.fund_id);
      setProviderId(base.provider_id ?? '');
      setFecha(getBaseFecha() ? String(getBaseFecha()).slice(0, 10) : new Date().toISOString().slice(0, 10));
      setMonto(String(getBaseMonto()));
      setMedio(getBaseMedio());
      setComprobante(getBaseComprobante());
      setPdfUrl(getBasePdfUrl());
      setEstado(base.estado);
      setNotas(base.notas ?? '');
    } else {
      setFundId(funds[0]?.id ?? '');
      setProviderId(providers[0]?.id ?? '');
      setFecha(new Date().toISOString().slice(0, 10));
      setMonto('0');
      setMedio('');
      setComprobante('');
      setPdfUrl('');
      setEstado('Pendiente');
      setNotas('');
    }
    setErr(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, isEdit, base?.id, funds, providers]);

  // Guardar — payload “superset” para ambos esquemas
  const save = async () => {
    if (!fundId) return setErr('Fondo requerido');
    if (!providerId) return setErr('Proveedor requerido');
    if (Number.isNaN(Number(monto))) return setErr('Monto inválido');

    setSaving(true);
    setErr(null);
    try {
      const payload: any = {
        fund_id: fundId,
        provider_id: providerId,

        // fecha
        fecha,
        fecha_emision: fecha,

        // monto
        monto: Number(monto),
        monto_total: Number(monto),

        // medio/comprobante/pdf (ambos nombres)
        medio: medio?.trim() || null,
        metodo_pago: medio?.trim() || null,

        comprobante: comprobante?.trim() || null,
        comprobante_url: pdfUrl?.trim() || null,

        pdf_url: pdfUrl?.trim() || null,

        estado,
        notas: notas?.trim() || null,
      };

      if (isEdit && base) {
        await api.patch(`/payments/${base.id}`, payload);
      } else {
        await api.post('/payments', payload);
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
          <h3 className="prv-modal__title">{isEdit ? 'Editar pago' : 'Nuevo pago'}</h3>
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
              <label>Proveedor</label>
              <select className="prv-inp" value={providerId} onChange={(e)=>setProviderId(e.target.value)}>
                {providers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="prv-grid">
              <div className="prv-col">
                <label>Fecha</label>
                <input className="prv-inp" type="date" value={fecha} onChange={(e)=>setFecha(e.target.value)} />
              </div>
              <div className="prv-col">
                <label>Monto *</label>
                <input className="prv-inp" type="number" step="0.01" value={monto} onChange={(e)=>setMonto(e.target.value)} />
              </div>
            </div>

            <div className="prv-grid">
              <div className="prv-col">
                <label>Medio</label>
                <input className="prv-inp" placeholder="Transferencia / Efectivo / etc." value={medio} onChange={(e)=>setMedio(e.target.value)} />
              </div>
              <div className="prv-col">
                <label>Comprobante</label>
                <input className="prv-inp" placeholder="Nro operación" value={comprobante} onChange={(e)=>setComprobante(e.target.value)} />
              </div>
            </div>

            <div className="prv-row">
              <label>PDF (URL)</label>
              <input className="prv-inp" placeholder="https://…" value={pdfUrl} onChange={(e)=>setPdfUrl(e.target.value)} />
            </div>

            {isEdit && (
              <div className="prv-row">
                <label>Subir PDF</label>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <input className="prv-inp" type="file" accept="application/pdf" onChange={onPickFile} />
                  <button className="prv-btn" onClick={uploadPdf} disabled={saving || !fileToUpload}>Subir</button>
                </div>
              </div>
            )}

            <div className="prv-row">
              <label>Estado</label>
              <select className="prv-inp" value={estado} onChange={(e)=>setEstado(e.target.value as Payment['estado'])}>
                <option>Pendiente</option>
                <option>Confirmado</option>
                <option>Anulado</option>
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

/* =============== Página =============== */
export default function PaymentsAdmin() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [estado, setEstado] = useState<Payment['estado'] | 'Todos'>('Todos');
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
        api.get<Provider[]>('/providers'),
        api.get<Payment[]>('/payments', {
          params: {
            q: debounced || undefined,
            estado: estado === 'Todos' ? undefined : estado,
            fund_id: fundFilter === 'Todos' ? undefined : fundFilter,
          },
        }),
      ]);
      setFunds(fres.data);
      setProviders(cres.data);
      setRows((lres.data as any[]).map(normalizePaymentRow));

    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e.message ?? 'No se pudieron obtener pagos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, estado, fundFilter]);

  const onDelete = async (id: string) => {
    if (!confirm('¿Borrar pago?')) return;
    try {
      await api.delete(`/payments/${id}`);
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
  const providersById = useMemo(() => {
    const m: Record<string, string> = {};
    providers.forEach((pr) => (m[pr.id] = pr.name));
    return m;
    }, [providers]);


  const countInfo = `${rows.length} pagos${loading ? ' (cargando...)' : ''}`;

  return (
    <div className="prv-root">
      <div className="prv-header">
        <h2 className="prv-title">Pagos</h2>
        <div className="prv-count">{countInfo}</div>
      </div>

      {/* Filtros */}
      <div className="prv-filters">
        <label className="prv-lbl" htmlFor="p-search">
          Buscar
        </label>
        <div className="prv-searchwrap">
          <input
            id="p-search"
            ref={searchRef}
            className="prv-inp"
            placeholder="Proeedor, comprobante o notas… (⌘/Ctrl K)"
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
            <option value="Confirmado">Confirmado</option>
            <option value="Anulado">Anulado</option>
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
          + Nuevo
        </button>
      </div>

      {err && <div className="prv-error">Error: {err}</div>}

      {/* Lista */}
      <div className="prv-list">
        {rows.map((p) => {
          const isOpen = openIds.has(p.id);

          return (
            <div key={p.id} className={`prv-item ${isOpen ? 'open' : ''}`}>
              <button
                className="prv-row"
                onClick={() => toggle(p.id)}
                onDoubleClick={() => setModal({ open: true, mode: 'edit', data: p })}
                aria-expanded={isOpen}
                title="Doble click para editar"
              >
                <div className="prv-row-main">
                  <div className="prv-name">
                    {p.provider_name ?? (p.provider_id ? providersById[p.provider_id] : null) ?? '—'}
                    <span style={{ marginLeft: 8, opacity: 0.6 }}>
                        ({fmtDate(p.fecha)})
                    </span>
                    </div>

                  <div className="prv-meta">
                    <span className="prv-pill" title="Fondo">
                      {fundsById[p.fund_id] ?? '—'}
                    </span>
                    <span
                      className={`prv-badge ${
                        p.estado === 'Confirmado'
                          ? 'ok'
                          : p.estado === 'Anulado'
                          ? 'warn'
                          : ''
                      }`}
                    >
                      {p.estado}
                    </span>
                    <span className="prv-chip" title="Monto">
                      {fmtMoney(p.monto)}
                    </span>
                  </div>
                </div>
                <div className="prv-caret" aria-hidden>▾</div>
              </button>

              {isOpen && (
                <div className="prv-detail">
                  <div className="prv-grid">
                    <div className="prv-col">
                      <div className="prv-dt">Medio</div>
                      <div className="prv-dd">{p.medio || '—'}</div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">Comprobante</div>
                      <div className="prv-dd">{p.comprobante || '—'}</div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">PDF</div>
                      <div className="prv-dd">
                        {p.pdf_url ? <a href={p.pdf_url} target="_blank" rel="noreferrer">Ver PDF</a> : '—'}
                      </div>
                    </div>
                  </div>

                  {p.notas && (
                    <div className="prv-note">
                      <div className="prv-dt">Notas</div>
                      <div className="prv-dd">{p.notas}</div>
                    </div>
                  )}

                  <div className="prv-detail-actions">
                    <button
                      className="prv-btn"
                      onClick={() => setModal({ open: true, mode: 'edit', data: p })}
                    >
                      Editar
                    </button>
                    <button
                      className="prv-btn prv-btn--danger"
                      onClick={() => onDelete(p.id)}
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
            <div className="prv-empty-title">Sin pagos</div>
            <div className="prv-empty-desc">Creá el primero con “+ Nuevo”.</div>
          </div>
        )}
      </div>

      <PaymentModal
        state={modal}
        onClose={() => setModal({ open: false })}
        onSaved={load}
        funds={funds}
        providers={providers}
      />
    </div>
  );
}
function setModal(arg0: { open: boolean; mode: string; data: Payment; }) {
    throw new Error('Function not implemented.');
}

