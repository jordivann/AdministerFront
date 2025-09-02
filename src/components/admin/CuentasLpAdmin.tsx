import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../lib/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import './styles/cuentas-lp.css';

type Cuenta = {
  id: string;
  name: string;
  monto: number;
  fecha_actualizacion: string; // ISO
  pdf_url?: string | null;
};

const fmtMoney = (n: number | undefined) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(n || 0));

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

export default function AdminCuentasLp() {
  const [rows, setRows] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // búsqueda
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 250);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // creación
  const [newName, setNewName] = useState('');
  const [newMonto, setNewMonto] = useState<string>('0');
  const [newPdfUrl, setNewPdfUrl] = useState<string>('');

  // edición inline (una fila a la vez)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPdfUrl, setEditPdfUrl] = useState('');
  const [editMonto, setEditMonto] = useState<string>('0');
  const isEditing = (id: string) => editingId === id;

  // cargar datos
  async function fetchData() {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get<Cuenta[]>('/cuentas-lospipinos', {
        params: { q: debounced || undefined, limit: 200, offset: 0 },
      });
      setRows(data);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e.message ?? 'No se pudieron obtener cuentas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // crear
  const createCuenta = async () => {
    if (!newName.trim()) return alert('Ingresá un nombre');
    const montoNum = Number(newMonto || 0);
    setLoading(true);
    setErr(null);
    try {
      await api.post('/cuentas-lospipinos', {
        name: newName.trim(),
        monto: montoNum,
        pdf_url: newPdfUrl || '',
      });
      setNewName('');
      setNewMonto('0');
      setNewPdfUrl('');
      await fetchData();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e.message ?? 'No se pudo crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  // entrar en modo edición
  const startEdit = (c: Cuenta) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditPdfUrl(c.pdf_url || '');
    setEditMonto(String(c.monto ?? 0));
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditPdfUrl('');
    setEditMonto('0');
  };

  // guardar edición
  const saveEdit = async (id: string) => {
    const payload: any = {};
    if (editName.trim() !== '') payload.name = editName.trim();
    payload.monto = Number(editMonto || 0);
    payload.pdf_url = editPdfUrl || '';

    setLoading(true);
    setErr(null);
    try {
      await api.patch(`/cuentas-lospipinos/${id}`, payload);
      cancelEdit();
      await fetchData();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e.message ?? 'No se pudo actualizar');
    } finally {
      setLoading(false);
    }
  };

  const countInfo = useMemo(
    () => `${rows.length} cuenta${rows.length === 1 ? '' : 's'}${loading ? ' (cargando...)' : ''}`,
    [rows.length, loading]
  );

  // atajo de teclado para buscar
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

  return (
    <div className="alp-root">
      <div className="alp-toolbar">
        <div className="alp-titles">
          <h2 className="alp-title">Cuentas — Los Pipinos</h2>
          <div className="alp-subtitle">{countInfo}</div>
        </div>

        <div className="alp-actions">
          <div className="alp-searchwrap">
            <input
              ref={searchRef}
              className="alp-input"
              placeholder="Buscar por nombre… (⌘/Ctrl K)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button className="alp-btn alp-btn--ghost alp-clear" onClick={() => setQ('')}>
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Crear nueva */}
      <div className="alp-card alp-create">
        <div className="alp-create-row">
          <label>Nombre</label>
          <input className="alp-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>

        <div className="alp-create-row">
          <label>Monto</label>
          <input
            className="alp-input"
            type="number"
            step="0.01"
            value={newMonto}
            onChange={(e) => setNewMonto(e.target.value)}
          />
        </div>

        <div className="alp-create-row">
          <label>PDF URL (opcional)</label>
          <input
            className="alp-input"
            placeholder="https://…"
            value={newPdfUrl}
            onChange={(e) => setNewPdfUrl(e.target.value)}
          />
        </div>

        <button className="alp-btn alp-btn--primary" onClick={createCuenta} disabled={loading}>
          + Agregar cuenta
        </button>
      </div>

      {err && <div className="alp-error">Error: {err}</div>}

      {/* Lista */}
      <div className="alp-list">
        {rows.map((c) => {
          const editing = isEditing(c.id);
          return (
            <div key={c.id} className="alp-item">
              <div className="alp-col-name">
                {editing ? (
                  <>
                    <input className="alp-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <input
                      className="alp-input"
                      placeholder="URL del PDF"
                      value={editPdfUrl}
                      onChange={(e) => setEditPdfUrl(e.target.value)}
                    />
                  </>
                ) : (
                  <>
                    <div className="alp-name">{c.name}</div>
                    {c.pdf_url ? (
                      <a href={c.pdf_url} target="_blank" rel="noopener noreferrer">
                        Ver PDF
                      </a>
                    ) : (
                      <span style={{ opacity: 0.6 }}>Sin PDF</span>
                    )}
                  </>
                )}
                <div className="alp-updated">Actualizado: {fmtDateTime(c.fecha_actualizacion)}</div>
              </div>

              <div className="alp-col-monto">
                {editing ? (
                  <input
                    className="alp-input alp-input--right"
                    type="number"
                    step="0.01"
                    value={editMonto}
                    onChange={(e) => setEditMonto(e.target.value)}
                  />
                ) : (
                  <div className={`alp-money ${Number(c.monto) < 0 ? 'neg' : Number(c.monto) > 0 ? 'pos' : ''}`}>
                    {fmtMoney(c.monto)}
                  </div>
                )}
              </div>

              <div className="alp-col-actions">
                {editing ? (
                  <>
                    <button className="alp-btn alp-btn--primary" onClick={() => saveEdit(c.id)} disabled={loading}>
                      Guardar
                    </button>
                    <button className="alp-btn alp-btn--ghost" onClick={cancelEdit} disabled={loading}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button className="alp-btn" onClick={() => startEdit(c)} disabled={loading}>
                    Editar
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!loading && rows.length === 0 && (
          <div className="alp-empty">
            <div className="alp-empty-title">Sin cuentas</div>
            <div className="alp-empty-desc">Agregá la primera cuenta con el formulario de arriba.</div>
          </div>
        )}
      </div>
    </div>
  );
}
