// src/components/admin/Clients.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../lib/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import './styles/providers.css'; // reutilizamos los estilos

type Client = {
  id: string;
  name: string;
  email?: string | null;
  cuit?: string | null;
  cbu?: string | null;
  Alias?: string | null;         // ¡Ojo! en DB viene con mayúscula, lo respetamos en el front
  aclaracion?: string | null;
  codIdioma?: string | null;     // en DB está "codIdioma" (camel)
  banco?: string | null;
};

type ModalState =
  | { mode: 'create'; open: true }
  | { mode: 'edit'; open: true; data: Client }
  | { open: false };

function ClientModal({
  state,
  onClose,
  onSaved,
}: {
  state: ModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!state.open) return null;

  const isEdit = state.mode === 'edit';
  const base: Client | undefined = isEdit ? state.data : undefined;

  // campos editables
  const [name, setName]     = useState(base?.name ?? '');
  const [email, setEmail]   = useState(base?.email ?? '');
  const [cuit, setCuit]     = useState(base?.cuit ?? '');
  const [cbu, setCbu]       = useState(base?.cbu ?? '');
  const [Alias, setAlias]   = useState(base?.Alias ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  // reset al abrir / cambiar de registro
  useEffect(() => {
    if (!state.open) return;
    if (isEdit && base) {
      setName(base.name ?? '');
      setEmail(base.email ?? '');
      setCuit(base.cuit ?? '');
      setCbu(base.cbu ?? '');
      setAlias(base.Alias ?? '');
    } else {
      setName('');
      setEmail('');
      setCuit('');
      setCbu('');
      setAlias('');
    }
    setErr(null);
  }, [state.open, isEdit, base?.id]); // ✅

  const save = async () => {
    if (!name.trim()) return setErr('El nombre es obligatorio.');
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        name: name.trim(),
        email: email?.trim() || null,
        cuit:  cuit?.trim()  || null,
        cbu:   cbu?.trim()   || null,
        Alias: Alias?.trim() || null, // coincide con la columna "Alias"
      };
      if (isEdit && base) {
        await api.patch(`/clients/${base.id}`, payload);
      } else {
        await api.post('/clients', payload);
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
          <h3 className="prv-modal__title">{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          <button className="prv-iconbtn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {err && <div className="prv-alert prv-alert--error">{typeof err === 'string' ? err : 'Error'}</div>}

        <div className="prv-modal__body">
          <div className="prv-form">
            <div className="prv-row">
              <label>Nombre *</label>
              <input className="prv-inp" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="prv-row">
              <label>Email</label>
              <input className="prv-inp" value={email ?? ''} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="prv-grid">
              <div className="prv-col">
                <label>CUIT</label>
                <input className="prv-inp" value={cuit ?? ''} onChange={(e) => setCuit(e.target.value)} />
              </div>
              <div className="prv-col">
                <label>CBU</label>
                <input className="prv-inp" value={cbu ?? ''} onChange={(e) => setCbu(e.target.value)} />
              </div>
            </div>

            <div className="prv-row">
              <label>Alias</label>
              <input className="prv-inp" value={Alias ?? ''} onChange={(e) => setAlias(e.target.value)} />
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

export default function AdminClients() {
  const [rows, setRows]     = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  const [query, setQuery]   = useState('');
  const debounced           = useDebouncedValue(query, 250);
  const searchRef           = useRef<HTMLInputElement | null>(null);

  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setOpenIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  async function copy(val?: string | null, key?: string) {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = val; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
    if (key) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1200);
    }
  }

  const [modal, setModal] = useState<ModalState>({ open: false });

  // 🔧 Carga (normalizada para evitar el 'never')
  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      // Forzamos el tipo de respuesta sin depender de genéricos del axios instance
      const data: Client[] = await api.get('/clients').then((r: any) => r.data as Client[]);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? 'No se pudo obtener clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(c => {
      const vals = [c.name, c.email, c.cuit, c.cbu, c.Alias].map(v => (v ?? '').toString().toLowerCase());
      return vals.some(v => v.includes(q));
    });
  }, [rows, debounced]);

  const countInfo = `${filtered.length} clientes${loading ? ' (cargando...)' : ''}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDelete = async (id: string) => {
    if (!confirm('¿Borrar cliente? Esta acción no puede deshacerse.')) return;
    try {
      await api.delete(`/clients/${id}`);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e.message ?? 'No se pudo borrar');
    }
  };

  return (
    <div className="prv-root">
      <div className="prv-header">
        <h2 className="prv-title">Clientes</h2>
        <div className="prv-count">{countInfo}</div>
      </div>

      <div className="prv-filters">
        <label className="prv-lbl" htmlFor="cli-search">Buscar</label>
        <div className="prv-searchwrap">
          <input
            id="cli-search"
            ref={searchRef}
            className="prv-inp"
            placeholder="Nombre, CUIT, CBU, Alias, email… (⌘/Ctrl K)"
            value={query}
            onChange={(e)=>setQuery(e.target.value)}
          />
          {query && (
            <button className="prv-btn prv-btn--ghost prv-clear" onClick={()=>setQuery('')}>Limpiar</button>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <button className="prv-btn prv-btn--primary" onClick={() => setModal({ open: true, mode: 'create' })}>
          + Nuevo
        </button>
      </div>

      {err && <div className="prv-error">Error: {err}</div>}

      <div className="prv-list">
        {filtered.map((c) => {
          const isOpen = openIds.has(c.id);
          return (
            <div key={c.id} className={`prv-item ${isOpen ? 'open' : ''}`}>
              <button
                className="prv-row"
                onClick={()=>toggle(c.id)}
                onDoubleClick={() => setModal({ open: true, mode: 'edit', data: c })}
                aria-expanded={isOpen}
                title="Doble click para editar"
              >
                <div className="prv-row-main">
                  <div className="prv-name">{c.name || '—'}</div>
                  <div className="prv-meta">
                    {c.Alias ? <span className="prv-badge" title="Alias">{c.Alias}</span> : null}
                    {c.cbu ?   <span className="prv-chip"  title="CBU">{c.cbu}</span>       : null}
                  </div>
                </div>
                <div className="prv-caret" aria-hidden>▾</div>
              </button>

              {isOpen && (
                <div className="prv-detail">
                  <div className="prv-grid">
                    <div className="prv-col">
                      <div className="prv-dt">Email</div>
                      <div className="prv-dd">{c.email || '—'}</div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">CUIT</div>
                      <div className="prv-dd prv-dd--row">
                        <span>{c.cuit || '—'}</span>
                        {c.cuit ? (
                          <button
                            className="prv-btn prv-btn--ghost prv-btn--sm"
                            onClick={()=>copy(c.cuit, `cuit-${c.id}`)}
                            title="Copiar CUIT"
                          >
                            {copiedKey === `cuit-${c.id}` ? 'Copiado' : 'Copiar'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">CBU</div>
                      <div className="prv-dd prv-dd--row">
                        <span>{c.cbu || '—'}</span>
                        {c.cbu ? (
                          <button
                            className="prv-btn prv-btn--ghost prv-btn--sm"
                            onClick={()=>copy(c.cbu, `cbu-${c.id}`)}
                            title="Copiar CBU"
                          >
                            {copiedKey === `cbu-${c.id}` ? 'Copiado' : 'Copiar'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">Alias</div>
                      <div className="prv-dd prv-dd--row">
                        <span>{c.Alias || '—'}</span>
                        {c.Alias ? (
                          <button
                            className="prv-btn prv-btn--ghost prv-btn--sm"
                            onClick={()=>copy(c.Alias!, `alias-${c.id}`)}
                            title="Copiar alias"
                          >
                            {copiedKey === `alias-${c.id}` ? 'Copiado' : 'Copiar'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="prv-detail-actions">
                    <button className="prv-btn" onClick={() => setModal({ open: true, mode: 'edit', data: c })}>
                      Editar
                    </button>
                    <button className="prv-btn prv-btn--danger" onClick={() => onDelete(c.id)}>
                      Borrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div className="prv-empty">
            <div className="prv-empty-title">Sin resultados</div>
            <div className="prv-empty-desc">Probá con otro término o limpiá el buscador.</div>
          </div>
        )}
      </div>

      <ClientModal
        state={modal}
        onClose={() => setModal({ open: false })}
        onSaved={load}
      />
    </div>
  );
}
