import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../lib/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import './styles/providers.css';

type Provider = {
  id: string;
  name: string;
  email?: string | null;
  cuit?: string | null;
  cbu?: string | null;
  Alias?: string | null;        // El backend devuelve esto así (respetamos para lectura)
  aclaracion?: string | null;
  codIdioma?: string | null;
  banco?: string | null;
};

/* ============ Helpers UI ============ */
function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = async (val?: string | null, key?: string) => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = val;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
    if (key) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1200);
    }
  };
  return { copiedKey, copy };
}

const toNull = (s: string) => (s.trim() ? s.trim() : null);

/* ============ Modal Crear/Editar ============ */

type EditorInitial =
  | { mode: 'create' }
  | { mode: 'edit'; data: Provider };

function ProviderEditorModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: EditorInitial;
  onSaved: () => void;
}) {
  const isEdit = initial.mode === 'edit';
  const base = initial.mode === 'edit' ? initial.data : undefined;

  const [name, setName]             = useState(base?.name ?? '');
  const [email, setEmail]           = useState(base?.email ?? '');
  const [cuit, setCuit]             = useState(base?.cuit ?? '');
  const [cbu, setCbu]               = useState(base?.cbu ?? '');
  const [alias, setAlias]           = useState(base?.Alias ?? '');
  const [banco, setBanco]           = useState(base?.banco ?? '');
  const [aclaracion, setAclar]      = useState(base?.aclaracion ?? '');
  const [codIdioma, setCodIdioma]   = useState(base?.codIdioma ?? '');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (isEdit && base) {
      setName(base.name ?? '');
      setEmail(base.email ?? '');
      setCuit(base.cuit ?? '');
      setCbu(base.cbu ?? '');
      setAlias(base.Alias ?? '');
      setBanco(base.banco ?? '');
      setAclar(base.aclaracion ?? '');
      setCodIdioma(base.codIdioma ?? '');
      setErr(null);
    } else {
      setName(''); setEmail(''); setCuit(''); setCbu(''); setAlias('');
      setBanco(''); setAclar(''); setCodIdioma(''); setErr(null);
    }
  }, [open, isEdit, base?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) { setErr('El nombre es obligatorio.'); return; }
    setSaving(true); setErr(null);
    try {
      // Mandamos ambas variantes para minimizar fricción de backend (Alias/alias, codIdioma/cod_idioma)
      const payload: any = {
        name: name.trim(),
        email: toNull(email ?? ''),
        cuit: toNull(cuit ?? ''),
        cbu: toNull(cbu ?? ''),
        alias: toNull(alias ?? ''),
        Alias: toNull(alias ?? ''),
        banco: toNull(banco ?? ''),
        aclaracion: toNull(aclaracion ?? ''),
        codIdioma: toNull(codIdioma ?? ''),
        cod_idioma: toNull(codIdioma ?? ''),
      };

      if (isEdit && base?.id) {
        await api.patch(`/providers/${base.id}`, payload);
      } else {
        await api.post('/providers', payload);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'No se pudo guardar el proveedor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="prv-modal" role="dialog" aria-modal="true">
      <div className="prv-modal__dialog">
        <div className="prv-modal__header">
          <h3 className="prv-modal__title">{isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
          <button className="prv-icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="prv-modal__body">
          {err && <div className="prv-form-error">{err}</div>}
          <div className="prv-form">
            <div className="prv-form__row">
              <label>Nombre *</label>
              <input className="prv-inp" value={name} onChange={e=>setName(e.target.value)} />
            </div>

            <div className="prv-form__row">
              <label>Email</label>
              <input className="prv-inp" value={email ?? ''} onChange={e=>setEmail(e.target.value)} />
            </div>

            <div className="prv-grid2">
              <div className="prv-form__row">
                <label>CUIT</label>
                <input className="prv-inp" value={cuit ?? ''} onChange={e=>setCuit(e.target.value)} />
              </div>
              <div className="prv-form__row">
                <label>Banco</label>
                <input className="prv-inp" value={banco ?? ''} onChange={e=>setBanco(e.target.value)} />
              </div>
            </div>

            <div className="prv-grid2">
              <div className="prv-form__row">
                <label>CBU</label>
                <input className="prv-inp" value={cbu ?? ''} onChange={e=>setCbu(e.target.value)} />
              </div>
              <div className="prv-form__row">
                <label>Alias</label>
                <input className="prv-inp" value={alias ?? ''} onChange={e=>setAlias(e.target.value)} />
              </div>
            </div>

            <div className="prv-grid2">
              <div className="prv-form__row">
                <label>Código idioma</label>
                <input className="prv-inp" value={codIdioma ?? ''} onChange={e=>setCodIdioma(e.target.value)} />
              </div>
              <div className="prv-form__row">
                <label>Aclaración</label>
                <input className="prv-inp" value={aclaracion ?? ''} onChange={e=>setAclar(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="prv-modal__footer">
          <button className="prv-btn prv-btn--ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="prv-btn prv-btn--primary" onClick={submit} disabled={saving}>
            {isEdit ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ Página ============ */

export default function AdminProviders() {
  const [rows, setRows] = useState<Provider[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 250);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // expand
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setOpen(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInit, setEditorInit] = useState<EditorInitial>({ mode: 'create' });

  const { copiedKey, copy } = useCopyFeedback();

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get('/providers');
      const arr: Provider[] = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
      setRows(arr);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? 'No se pudo obtener proveedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // filtro
  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(p => {
      const hay = [
        p.name,
        p.email,
        p.cuit,
        p.cbu,
        p.Alias,
        p.banco,
        p.aclaracion,
        p.codIdioma
      ].map(v => (v ?? '').toString().toLowerCase());
      return hay.some(v => v.includes(q));
    });
  }, [rows, debounced]);

  const countInfo = `${filtered.length} proveedor${filtered.length === 1 ? '' : 'es'}${loading ? ' (cargando...)' : ''}`;

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

  const openCreate = () => {
    setEditorInit({ mode: 'create' });
    setEditorOpen(true);
  };
  const openEdit = (p: Provider) => {
    setEditorInit({ mode: 'edit', data: p });
    setEditorOpen(true);
  };

  return (
    <div className="prv-root">
      <div className="prv-header">
        <div className="prv-header__left">
          <h2 className="prv-title">Proveedores</h2>
          <div className="prv-count">{countInfo}</div>
        </div>
        <div className="prv-header__right">
          <button className="prv-btn prv-btn--primary" onClick={openCreate}>+ Nuevo</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="prv-filters">
        <label className="prv-lbl" htmlFor="prv-search">Buscar</label>
        <div className="prv-searchwrap">
          <input
            id="prv-search"
            ref={searchRef}
            className="prv-inp"
            placeholder="Nombre, CBU, Alias, CUIT, email, banco… (⌘/Ctrl K)"
            value={query}
            onChange={e=>setQuery(e.target.value)}
          />
          {query && (
            <button className="prv-btn prv-btn--ghost prv-clear" onClick={()=>setQuery('')}>Limpiar</button>
          )}
        </div>
      </div>

      {err && <div className="prv-error">Error: {err}</div>}

      {/* Lista */}
      <div className="prv-list">
        {filtered.map((p) => {
          const isOpen = open.has(p.id);
          return (
            <div key={p.id} className={`prv-item ${isOpen ? 'open' : ''}`}>
              <button
                className="prv-row"
                onClick={()=>toggle(p.id)}
                onDoubleClick={() => openEdit(p)}
                aria-expanded={isOpen}
                title="Click para abrir/cerrar, doble-click para editar"
              >
                <div className="prv-row-main">
                  <div className="prv-name">{p.name || '—'}</div>
                  <div className="prv-meta">
                    {p.Alias ? <span className="prv-badge" title="Alias">{p.Alias}</span> : null}
                    {p.cbu ? <span className="prv-chip" title="CBU">{p.cbu}</span> : null}
                    {p.banco ? <span className="prv-pill" title="Banco">{p.banco}</span> : null}
                  </div>
                </div>
                <div className="prv-caret" aria-hidden>▾</div>
              </button>

              {/* Detalle */}
              {isOpen && (
                <div className="prv-detail">
                  <div className="prv-grid">
                    <div className="prv-col">
                      <div className="prv-dt">Email</div>
                      <div className="prv-dd">{p.email || '—'}</div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">CUIT</div>
                      <div className="prv-dd prv-dd--row">
                        <span>{p.cuit || '—'}</span>
                        {p.cuit ? (
                          <button
                            className="prv-btn prv-btn--ghost prv-btn--sm"
                            onClick={()=>copy(p.cuit, `cuit-${p.id}`)}
                            title="Copiar CUIT"
                          >
                            {copiedKey === `cuit-${p.id}` ? 'Copiado' : 'Copiar'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">CBU</div>
                      <div className="prv-dd prv-dd--row">
                        <span>{p.cbu || '—'}</span>
                        {p.cbu ? (
                          <button
                            className="prv-btn prv-btn--ghost prv-btn--sm"
                            onClick={()=>copy(p.cbu, `cbu-${p.id}`)}
                            title="Copiar CBU"
                          >
                            {copiedKey === `cbu-${p.id}` ? 'Copiado' : 'Copiar'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">Alias</div>
                      <div className="prv-dd prv-dd--row">
                        <span>{p.Alias || '—'}</span>
                        {p.Alias ? (
                          <button
                            className="prv-btn prv-btn--ghost prv-btn--sm"
                            onClick={()=>copy(p.Alias!, `alias-${p.id}`)}
                            title="Copiar alias"
                          >
                            {copiedKey === `alias-${p.id}` ? 'Copiado' : 'Copiar'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">Banco</div>
                      <div className="prv-dd">{p.banco || '—'}</div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">Aclaración</div>
                      <div className="prv-dd">{p.aclaracion || '—'}</div>
                    </div>
                    <div className="prv-col">
                      <div className="prv-dt">Cod. idioma</div>
                      <div className="prv-dd">{p.codIdioma || '—'}</div>
                    </div>
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

      {/* Modal Crear/Editar */}
      <ProviderEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        initial={editorInit}
        onSaved={load}
      />
    </div>
  );
}
