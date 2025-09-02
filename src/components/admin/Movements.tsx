import { useEffect, useMemo, useRef, useState } from 'react';
import api, { prettyFactura } from '../../lib/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import './styles/movements.css';

/** ================= Tipos ================= **/
type TxType = 'credit' | 'debit';

type Tx = {
  id: string;
  tx_date?: string;
  account_id?: string;
  fund_id?: string | null;
  currency?: string;
  amount?: number;
  unsignedAmount?: number;
  type?: TxType | null;
  description?: string | null;
  fund_name?: string | null;
  account_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  [k: string]: any;
};

type Fund = { id: string; name?: string };
type Account = { id: string; name: string };
type Category = { id: string; name: string };

// NUEVO: facturas (para asociar ingreso)
type PendingInvoice = {
  id: string;
  fund_id: string;
  client_name?: string | null;
  monto_total?: number;
  numero: string;
  estado: 'Pendiente' | 'Cobrado' | 'Baja';
};

type FormState = {
  type: TxType;
  fund_id: string;
  account_id: string;
  tx_date: string;
  description: string;
  amount: string;
  category_id: string | null;
  // NUEVO: asociación con factura
  link_invoice?: boolean;
  invoice_id?: string | null;
};

/** ================= Zona horaria (GMT-3) ================= **/
const TZ = 'America/Argentina/Buenos_Aires';
const ymdInTZ = (d: Date, tz = TZ) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const todayYMD = () => ymdInTZ(new Date());
const daysAgoYMD = (n: number) => ymdInTZ(new Date(Date.now() - n * 86400000));

function fmtDate(s?: string){
  if (!s) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(+d)) return String(s).slice(0,10);
  return ymdInTZ(d);
}

/** ================= Utils ================= **/
const toNumber = (x: unknown) => (x==null || x==='') ? undefined : (Number.isFinite(Number(x)) ? Number(x) : undefined);
function fmtMoney(n: number | undefined, currency?: string){
  if (n === undefined) return '—';
  try { return currency ? new Intl.NumberFormat('es-AR', { style:'currency', currency }).format(n)
                        : new Intl.NumberFormat('es-AR').format(n); }
  catch { return new Intl.NumberFormat('es-AR').format(n); }
}
function pick<T = any>(o: any, ks: string[], fb?: T): T | undefined {
  for (const k of ks) if (o && o[k] !== undefined) return o[k] as T;
  return fb;
}
function normalize(row: any, i: number): Tx {
  const id   = String(pick(row, ['transaction_id','id','tx_id','uuid'], `row-${i}`));
  const type = (String(pick(row, ['type','tx_type'], '') || '').toLowerCase() || null) as TxType | null;
  const raw  = toNumber(pick(row, ['amount','value','monto','importe']));
  const signedPref = toNumber(pick(row, ['amount_signed_alloc','amount_signed']));
  const signed = signedPref ?? (raw !== undefined ? (type==='debit' ? -Math.abs(raw) : Math.abs(raw)) : undefined);
  return {
    id,
    tx_date: pick(row,['tx_date','date','created_at']),
    account_id: pick(row,['account_id','account','accountId']),
    fund_id: pick(row,['fund_id','fund','fundId']),
    currency: pick(row,['currency','moneda']),
    amount: signed,
    unsignedAmount: raw,
    type,
    description: pick(row,['description','concept','detalle']),
    category_id: pick(row, ['category_id']) ?? null,
    category_name: pick(row, ['category_name']) ?? null,
    fund_name: pick(row, ['fund_name']) ?? null,
    account_name: pick(row, ['account_name']) ?? null,
    ...row,
  };
}
const cmp = (a: any, b: any) => (a==null && b==null) ? 0 : (a==null) ? -1 : (b==null) ? 1 : (a<b ? -1 : a>b ? 1 : 0);
function asDateKey(v: unknown) {
  if (typeof v === 'string') {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v);
    const t = d.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (v instanceof Date) return v.getTime();
  return 0;
}

/** NUEVO: clasificador por type con fallback al signo */
function txKind(r: Tx): 'ingreso' | 'egreso' | 'neutro' {
  if (r.type === 'credit') return 'ingreso';
  if (r.type === 'debit')  return 'egreso';
  return 'neutro';
}

/** ================= Componente ================= **/
export default function AdminMovements() {
  // datos
  const [rows, setRows] = useState<Tx[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [acctMap, setAcctMap] = useState<Record<string, string>>({});

  // NUEVO: facturas pendientes (para asociar en creación de ingreso)
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingErr, setPendingErr] = useState<string | null>(null);

  // ui
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // filtros
  const [from, setFrom] = useState<string>(daysAgoYMD(90));
  const [to, setTo] = useState<string>(todayYMD());
  const [fundId, setFundId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [type, setType] = useState<'' | TxType>('');
  const [query, setQuery] = useState<string>('');
  const debouncedQuery = useDebouncedValue(query, 350);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // incluir comunes cuando se filtra Rioja/Pipinos
  const [includeComunes, setIncludeComunes] = useState<boolean>(true);

  // orden/pag
  const [sortKey, setSortKey] = useState<keyof Tx>('tx_date');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // creación
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>({
    type: 'credit',
    fund_id: '',
    account_id: '',
    tx_date: todayYMD(),
    description: '',
    amount: '',
    category_id: null,
    link_invoice: false,
    invoice_id: null,
  });

  // edición
  const [editing, setEditing] = useState<Tx | null>(null);
  const [editForm, setEditForm] = useState<FormState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // === CSV IMPORT: estado/refs ===
  const fileRef = useRef<HTMLInputElement|null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File|null>(null);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importErr, setImportErr] = useState<string|null>(null);
  const [importUploading, setImportUploading] = useState(false);
  const [importRowErrors, setImportRowErrors] = useState<Record<number,string>>({});
  const REQUIRED_HEADERS = ['account_id','date','description','amount','type','category_id','fund_id'] as const;

  const modalOpen = showCreate || !!editing || importOpen;

  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [modalOpen]);

  /** Mapas id -> nombre */
  const fundById = useMemo(() => {
    const m: Record<string,string> = {};
    for (const f of funds) m[f.id] = f.name ?? f.id;
    return m;
  }, [funds]);
  const accountById = useMemo(() => acctMap, [acctMap]);
  const categoryById = useMemo(() => {
    const m: Record<string,string> = {};
    for (const c of categories) m[c.id] = c.name;
    return m;
  }, [categories]);

  /** Cargas iniciales */
  useEffect(() => {
    api.get('/funds').then(r => {
      const list: Fund[] = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
      setFunds(list);
    }).catch(()=>{});
  }, []);
  useEffect(() => {
    api.get('/categories').then(r => {
      const list: Category[] = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
      setCategories(list);
    }).catch(()=>{});
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/transactions/accounts');
        const arr: any[] = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
        const list: Account[] = arr.map(a => ({ id: a.id || a.account_id, name: a.name || a.account_name }));
        setAccounts(list);
        const map: Record<string,string> = {}; list.forEach(a => { map[a.id] = a.name; });
        setAcctMap(map);
      } catch {
        try {
          const r = await api.get('/accounts');
          const arr: any[] = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
          const list: Account[] = arr.map(a => ({ id: a.id || a.account_id, name: a.name || a.account_name }));
          setAccounts(list);
          const map: Record<string,string> = {}; list.forEach(a => { map[a.id] = a.name; });
          setAcctMap(map);
        } catch {
          try {
            const r2 = await api.get('/balances/accounts');
            const arr: any[] = Array.isArray(r2.data) ? r2.data : (r2.data?.data ?? []);
            const list: Account[] = arr.map(a => ({ id: a.account_id, name: a.account_name }));
            setAccounts(list);
            const map: Record<string,string> = {}; list.forEach(a => { map[a.id] = a.name; });
            setAcctMap(map);
          } catch {}
        }
      }
    })();
  }, []);

  // cuenta por defecto (última usada o primera)
  useEffect(() => {
    if (accounts.length && !form.account_id) {
      const last = localStorage.getItem('mov.lastAccountId');
      const def = (last && accounts.some(a => a.id === last)) ? last : (accounts[0]?.id ?? '');
      setForm(f => ({ ...f, account_id: def }));
    }
  }, [accounts, form.account_id]);

  /** Datos */
  async function loadData() {
    setLoading(true); setErr(null); setRows([]); setPage(1);
    const params: Record<string, any> = {};
    if (from) params.from = from;
    if (to) params.to = to;
    // Si estoy filtrando Rioja/Pipinos y quiero incluir Comunes, NO paso fund_id al backend
    function findFundIdLocal(name?: string, alt?: string){ return findFundId(name ?? '', alt ?? ''); }
    const fundIdRioja   = findFundIdLocal('La Rioja');
    const fundIdPipinos = findFundIdLocal('Los Pipinos','Pipinos');
    const isSpecialFund = fundId && (fundId === fundIdRioja || fundId === fundIdPipinos);
    if (fundId && !(isSpecialFund && includeComunes)) params.fund_id = fundId;
    if (categoryId) params.category_id = categoryId;
    try {
      const r = await api.get('/transactions', { params });
      const arr: Tx[] = (Array.isArray(r.data) ? r.data : (r.data?.rows || r.data?.data || r.data?.items || []))
        .map((row: any, i: number) => normalize(row, i));
      setRows(arr);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? 'Error al obtener transacciones');
    } finally { setLoading(false); }
  }
  useEffect(() => { loadData(); }, []); // mount

  /** Restaurar/sincronizar filtros (URL + localStorage) */
  useEffect(() => {
    const s = localStorage.getItem('mov.filters');
    try {
      const v = s ? JSON.parse(s) : null;
      if (v) {
        setFrom(v.from ?? from);
        setTo(v.to ?? to);
        setFundId(v.fundId ?? '');
        setCategoryId(v.categoryId ?? '');
        setType(v.type ?? '');
        setQuery(v.query ?? '');
      }
    } catch {}
    const qs = new URLSearchParams(window.location.search);
    const q_from = qs.get('from'); if (q_from) setFrom(q_from);
    const q_to = qs.get('to'); if (q_to) setTo(q_to);
    const q_fund = qs.get('fund'); if (q_fund) setFundId(q_fund);
    const q_cat = qs.get('cat'); if (q_cat) setCategoryId(q_cat);
    const q_type = qs.get('type') as ''|TxType|null; if (q_type === 'credit' || q_type === 'debit') setType(q_type);
    const q_q = qs.get('q'); if (q_q) setQuery(q_q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (fundId) params.set('fund', fundId);
    if (categoryId) params.set('cat', categoryId);
    if (type) params.set('type', type);
    if (debouncedQuery) params.set('q', debouncedQuery);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    localStorage.setItem('mov.filters', JSON.stringify({ from, to, fundId, categoryId, type, query: debouncedQuery }));
  }, [from, to, fundId, categoryId, type, debouncedQuery]);

  /** Helpers */
  function fundIdByName(name?: string) {
    if (!name) return '';
    const n = name.trim().toLowerCase();
    const f = funds.find(f => String(f.name ?? '').trim().toLowerCase() === n);
    return f?.id ?? '';
  }
  function openCreate(t: { type: TxType; fundName?: string }) {
    const lastAcc = localStorage.getItem('mov.lastAccountId');
    const defAcc = (lastAcc && accounts.some(a => a.id === lastAcc)) ? lastAcc : (accounts[0]?.id || '');
    setForm({
      type: t.type, fund_id: fundIdByName(t.fundName), account_id: defAcc,
      tx_date: todayYMD(), description: '', amount: '', category_id: null,
      link_invoice: false, invoice_id: null,
    });
    setShowCreate(true);
  }

  // NUEVO: cargar facturas pendientes cuando abro modal de creación de ingreso o cambia fondo
  useEffect(() => {
    if (!showCreate) return;
    if (form.type !== 'credit') { setPendingInvoices([]); return; }
    if (!form.fund_id) { setPendingInvoices([]); return; }

    (async () => {
      setPendingLoading(true); setPendingErr(null);
      try {
        const r = await api.get<PendingInvoice[]>('/facturas', { params: { estado: 'Pendiente', fund_id: form.fund_id } });
        const arr = Array.isArray(r.data) ? r.data : (r.data as any)?.data ?? [];
        setPendingInvoices(arr);
        setForm(f => ({ ...f, invoice_id: arr.some((x: { id: string | null | undefined; }) => x.id === f.invoice_id) ? f.invoice_id! : null }));
      } catch (e: any) {
        setPendingErr(e?.response?.data?.error ?? e.message ?? 'No se pudo obtener facturas pendientes');
        setPendingInvoices([]);
      } finally {
        setPendingLoading(false);
      }
    })();
  }, [showCreate, form.fund_id, form.type]);

  async function submitCreate() {
    const amountNum = Number(form.amount);
    if (!form.account_id || !amountNum || !(amountNum > 0)) { alert('Completá cuenta y un monto > 0'); return; }
    if (!form.fund_id) { alert('Seleccioná un fondo'); return; }
    const body = {
      account_id: form.account_id, tx_date: form.tx_date,
      description: form.description || null, amount: amountNum,
      type: form.type, fund_id: form.fund_id, category_id: form.category_id ?? null,
    };
    try {
      await api.post('/transactions', body);

      // NUEVO: si es ingreso y hay factura seleccionada, marcarla como Cobrado
      if (form.type === 'credit' && form.link_invoice && form.invoice_id) {
        try {
          await api.patch(`/facturas/${form.invoice_id}/estado`, { estado: 'Cobrado' });
        } catch (e: any) {
          console.warn('No se pudo actualizar estado de la factura:', e?.response?.data?.error ?? e?.message);
          alert('El movimiento se creó, pero no se pudo marcar la factura como cobrada.');
        }
      }

      setShowCreate(false);
      await loadData();
    }
    catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? 'No se pudo crear el movimiento');
    }
  }

  function openEdit(row: Tx) {
    const unsigned = row.unsignedAmount ?? Math.abs(row.amount ?? 0);
    setEditing(row);
    setEditForm({
      type: (row.type as TxType) ?? 'credit',
      fund_id: (row.fund_id ?? '') as string,
      account_id: row.account_id ?? '',
      tx_date: row.tx_date ? fmtDate(row.tx_date) : todayYMD(),
      description: row.description ?? '',
      amount: unsigned ? String(unsigned) : '',
      category_id: row.category_id ?? null,
    });
  }
  async function submitEdit() {
    if (!editing || !editForm) return;
    const amountNum = Number(editForm.amount);
    if (!editForm.account_id || !editForm.fund_id || !amountNum || !(amountNum > 0)) {
      alert('Completá cuenta, fondo y un monto > 0'); return;
    }
    const patch: Record<string, any> = {};
    const oldUnsigned = editing.unsignedAmount ?? Math.abs(editing.amount ?? 0);
    if (editForm.account_id !== (editing.account_id ?? '')) patch.account_id = editForm.account_id;
    if (editForm.tx_date !== (editing.tx_date ?? '')) patch.tx_date = editForm.tx_date;
    if ((editForm.description ?? '') !== (editing.description ?? '')) patch.description = editForm.description || null;
    if (editForm.type !== (editing.type ?? 'credit')) patch.type = editForm.type;
    if (editForm.fund_id !== (editing.fund_id ?? '')) patch.fund_id = editForm.fund_id;
    const newCat = editForm.category_id ?? null;
    const oldCat = editing.category_id ?? null;
    if (newCat !== oldCat) patch.category_id = newCat;
    if (amountNum !== oldUnsigned) patch.amount = amountNum;
    if (Object.keys(patch).length === 0) { setEditing(null); setEditForm(null); return; }

    try {
      setSavingEdit(true);
      await api.patch(`/transactions/${editing.id}`, patch);
      const newUnsigned = patch.amount ?? oldUnsigned;
      const signed = (editForm.type === 'debit' ? -1 : 1) * Math.abs(newUnsigned);
      setRows(prev => prev.map(r => {
        if (r.id !== editing.id) return r;
        const next: Tx = { ...r };
        if (patch.account_id) { next.account_id = patch.account_id; next.account_name = accountById[patch.account_id] ?? next.account_name; }
        if (patch.tx_date)     next.tx_date = patch.tx_date;
        if ('description' in patch) next.description = patch.description;
        if (patch.type)        next.type = patch.type;
        if (patch.fund_id)   { next.fund_id = patch.fund_id; next.fund_name = fundById[patch.fund_id] ?? next.fund_name; }
        if ('category_id' in patch) {
          next.category_id = patch.category_id;
          next.category_name = patch.category_id ? (categoryById[patch.category_id] ?? next.category_name) : null;
        }
        if ('amount' in patch) { next.unsignedAmount = Math.abs(newUnsigned); }
        next.amount = signed;
        return next;
      }));
      setEditing(null);
      setEditForm(null);
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? 'No se pudo actualizar el movimiento');
    } finally {
      setSavingEdit(false);
    }
  }
  async function confirmDelete() {
    if (!editing) return;
    if (!confirm('¿Eliminar definitivamente este movimiento?')) return;
    try {
      await api.delete(`/transactions/${editing.id}`);
      setRows(prev => prev.filter(r => r.id !== editing.id));
      setEditing(null);
      setEditForm(null);
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? 'No se pudo eliminar el movimiento');
    }
  }

  /** Buscar IDs de fondos clave */
  function findFundId(...names: string[]): string {
    const needle = names.map(n => n.trim().toLowerCase());
    const f = funds.find(f => needle.includes(String(f.name ?? '').trim().toLowerCase()));
    return f?.id ?? '';
  }
  const fundIdRioja   = useMemo(()=>findFundId('La Rioja'), [funds]);
  const fundIdPipinos = useMemo(()=>findFundId('Los Pipinos','Pipinos'), [funds]);
  const fundIdComunes = useMemo(()=>findFundId('Comunes','Común','Comun'), [funds]);

  /** Filtrar / ordenar / paginar */
  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();
    const specialSelected = fundId && (fundId === fundIdRioja || fundId === fundIdPipinos);

    return rows.filter(r => {
      // Filtro por fondo (incluyendo comunes si corresponde)
      if (fundId) {
        if (specialSelected && includeComunes) {
          if (!(r.fund_id === fundId || r.fund_id === fundIdComunes)) return false;
        } else {
          if (r.fund_id !== fundId) return false;
        }
      }
      if (type && String(r.type ?? '').toLowerCase() !== type) return false;
      if (!q) return true;

      const catLabel = (r.category_name ?? (r.category_id ? categoryById[r.category_id] : undefined)) ?? '';
      const fundLabel = (r.fund_name ?? (r.fund_id ? fundById[r.fund_id] : undefined)) ?? '';
      const accLabel  = (r.account_name ?? (r.account_id ? accountById[r.account_id] : undefined)) ?? '';

      return (r.description ?? '').toLowerCase().includes(q)
          || fundLabel.toLowerCase().includes(q)
          || accLabel.toLowerCase().includes(q)
          || (r.currency ?? '').toLowerCase().includes(q)
          || catLabel.toLowerCase().includes(q);
    });
  }, [rows, type, debouncedQuery, categoryById, fundById, accountById, fundId, includeComunes, fundIdRioja, fundIdPipinos, fundIdComunes]);

  const sorted = useMemo(() => {
    const a = [...filtered];
    a.sort((x, y) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'amount') return dir * cmp(Number(x.amount ?? 0), Number(y.amount ?? 0));
      if (sortKey === 'tx_date') {
        const r = dir * cmp(asDateKey(x.tx_date), asDateKey(y.tx_date));
        return r !== 0 ? r : dir * cmp(x.id, y.id);
      }
      return dir * String(x[sortKey] ?? '').localeCompare(String(y[sortKey] ?? ''));
    });
    return a;
  }, [filtered, sortKey, sortDir]);

  const start = (page - 1) * pageSize;
  const paged = sorted.slice(start, start + pageSize);

  const countInfo = `${filtered.length} movimientos (de ${rows.length})`;
  const toggleSort = (k: keyof Tx) => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('desc'); } };
  function quick(p:'7'|'30'|'mtd'|'ytd'|'all'){
    if (p==='7'){ setFrom(daysAgoYMD(7)); setTo(todayYMD()); }
    else if (p==='30'){ setFrom(daysAgoYMD(30)); setTo(todayYMD()); }
    else if (p==='mtd'){ const [y,m] = todayYMD().split('-'); setFrom(`${y}-${m}-01`); setTo(todayYMD()); }
    else if (p==='ytd'){ const y = todayYMD().slice(0,4); setFrom(`${y}-01-01`); setTo(todayYMD()); }
    else { setFrom(''); setTo(''); }
  }
  function exportCSV() {
    const headers = ['Fecha','Fondo','Categoría','Cuenta','Moneda','Importe','Tipo','Descripción'];
    const lines = filtered.map(r => [
      fmtDate(r.tx_date),
      (r.fund_name ?? fundById[r.fund_id ?? ''] ?? r.fund_id ?? ''),
      (r.category_name ?? categoryById[r.category_id ?? ''] ?? ''),
      (r.account_name ?? accountById[r.account_id ?? ''] ?? r.account_id ?? ''),
      r.currency ?? '',
      String(r.amount ?? ''),
      r.type ?? '',
      (r.description ?? '').replace(/\n/g, ' ')
    ]);
    const csv = [headers, ...lines].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `movimientos_${todayYMD()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

type FundAgg = {
  name: string;
  ingSum: number; ingCount: number;
  egSumAbs: number; egCount: number;
  total: number; // neto = ingSum - egSumAbs
};

const byFund = useMemo(() => {
  const map = new Map<string, FundAgg>();
  for (const r of filtered) {
    const fid = r.fund_id ?? '—';
    const name = r.fund_name ?? fundById[fid] ?? fid;
    if (!map.has(fid)) map.set(fid, { name, ingSum:0, ingCount:0, egSumAbs:0, egCount:0, total:0 });
    const s = map.get(fid)!;

    const kind = txKind(r);                 // 'ingreso' | 'egreso' | 'neutro'
    const abs = Math.abs(r.amount ?? 0);    // amount llega positivo

    if (kind === 'ingreso') {
      s.ingSum += abs; s.ingCount++;
      s.total  += abs;                      // + ingresos
    } else if (kind === 'egreso') {
      s.egSumAbs += abs; s.egCount++;
      s.total    -= abs;                    // - egresos
    }
  }
  return map;
}, [filtered, fundById]);


  const comunesEgAbs = byFund.get(fundIdComunes)?.egSumAbs ?? 0;

  const cardRioja = {
    title: 'La Rioja',
    ingSum: byFund.get(fundIdRioja)?.ingSum ?? 0,
    ingCount: byFund.get(fundIdRioja)?.ingCount ?? 0,
    egSumAbs: byFund.get(fundIdRioja)?.egSumAbs ?? 0,
    egCount: byFund.get(fundIdRioja)?.egCount ?? 0,
    total: byFund.get(fundIdRioja)?.total ?? 0,
    netWithComunes: (byFund.get(fundIdRioja)?.ingSum ?? 0) - (byFund.get(fundIdRioja)?.egSumAbs ?? 0) - (comunesEgAbs/2),
  };
  const cardPipinos = {
    title: 'Los Pipinos',
    ingSum: byFund.get(fundIdPipinos)?.ingSum ?? 0,
    ingCount: byFund.get(fundIdPipinos)?.ingCount ?? 0,
    egSumAbs: byFund.get(fundIdPipinos)?.egSumAbs ?? 0,
    egCount: byFund.get(fundIdPipinos)?.egCount ?? 0,
    total: byFund.get(fundIdPipinos)?.total ?? 0,
    netWithComunes: (byFund.get(fundIdPipinos)?.ingSum ?? 0) - (byFund.get(fundIdPipinos)?.egSumAbs ?? 0) - (comunesEgAbs/2),
  };
  const cardComunes = {
    title: 'Comunes',
    ingSum: byFund.get(fundIdComunes)?.ingSum ?? 0,
    ingCount: byFund.get(fundIdComunes)?.ingCount ?? 0,
    egSumAbs: byFund.get(fundIdComunes)?.egSumAbs ?? 0,
    egCount: byFund.get(fundIdComunes)?.egCount ?? 0,
    total: byFund.get(fundIdComunes)?.total ?? 0,
  };

  /** Atajos */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') {
        if (showCreate) setShowCreate(false);
        if (editing && !savingEdit) { setEditing(null); setEditForm(null); }
        if (importOpen && !importUploading) setImportOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreate, editing, savingEdit, importOpen, importUploading]);

  const onChangeAccountCreate = (id: string) => { localStorage.setItem('mov.lastAccountId', id); setForm(f => ({ ...f, account_id: id })); };
  const onChangeAccountEdit = (id: string) => { localStorage.setItem('mov.lastAccountId', id); setEditForm(f => f ? ({ ...f, account_id: id }) : f); };

  /** === CSV IMPORT: helpers (parser + validación + upload) === */
  function parseCSV(text: string): Record<string,string>[] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let i = 0, inQuotes = false;

    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i+1] === '"') { cell += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        } else { cell += ch; i++; continue; }
      } else {
        if (ch === '"') { inQuotes = true; i++; continue; }
        if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
        if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
        if (ch === '\r') { i++; continue; }
        cell += ch; i++; continue;
      }
    }
    row.push(cell); rows.push(row);

    if (rows.length === 0) return [];
    const header = rows[0].map(h => String(h ?? '').trim());
    const out: Record<string,string>[] = [];
    for (let r = 1; r < rows.length; r++) {
      if (rows[r].every(v => String(v ?? '').trim() === '')) continue;
      const o: Record<string,string> = {};
      rows[r].forEach((v, idx) => { o[header[idx] ?? `col${idx}`] = v; });
      out.push(o);
    }
    return out;
  }
  const toLowerKeys = (obj: Record<string, any>) => {
    const o: Record<string, any> = {};
    Object.keys(obj).forEach(k => { o[k.toLowerCase()] = obj[k]; });
    return o;
  };
  function validateHeaders(rows: Record<string,string>[]): string | null {
    if (!rows.length) return 'El CSV no tiene datos.';
    const keys = Object.keys(toLowerKeys(rows[0]));
    const missing = REQUIRED_HEADERS.filter((h) => !keys.includes(h));
    if (missing.length) return `Faltan columnas: ${missing.join(', ')}`;
    return null;
  }
  function isUUID(s: string){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s); }
  function isDateYMD(s: string){ return /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function validateLocalRows(preview: any[]): Record<number,string> {
    const errs: Record<number,string> = {};
    preview.forEach((r, i) => {
      const problems: string[] = [];
      if (!r.account_id || !isUUID(r.account_id)) problems.push('account_id inválido');
      if (!r.fund_id   || !isUUID(r.fund_id))     problems.push('fund_id inválido');
      if (!r.date || !isDateYMD(r.date))          problems.push('date debe ser YYYY-MM-DD');
      if (!r.type || !['credit','debit'].includes(String(r.type).toLowerCase())) problems.push('type debe ser credit|debit');
      const amt = Number(r.amount);
      if (!Number.isFinite(amt) || !(amt > 0))    problems.push('amount debe ser número > 0');
      if (r.category_id && !isUUID(r.category_id)) problems.push('category_id inválido (o dejalo vacío)');
      if (problems.length) errs[i] = problems.join(' · ');
    });
    return errs;
  }

  async function onPickCSV(file: File) {
    setImportErr(null); setImportRows([]); setImportFile(file); setImportRowErrors({});
    try {
      const text = await file.text();
      const rows = parseCSV(text).map(r => toLowerKeys(r));
      const err = validateHeaders(rows);
      if (err) { setImportErr(err); setImportRows([]); setImportOpen(true); return; }
      const preview = rows.map(r => ({
        account_id: r.account_id ?? '',
        date: r.date ?? r.tx_date ?? '',
        description: r.description ?? '',
        amount: r.amount ?? '',
        type: (r.type ?? '').toLowerCase(),
        category_id: r.category_id ?? '',
        fund_id: r.fund_id ?? '',
      }));
      setImportRows(preview);

      // validación local
      const localErrs = validateLocalRows(preview);
      setImportRowErrors(localErrs);
      setImportErr(Object.keys(localErrs).length ? 'El CSV tiene problemas de formato local. Revisá las filas marcadas.' : null);

      setImportOpen(true);
    } catch (e:any) {
      setImportErr(e?.message ?? 'No se pudo leer el CSV');
      setImportOpen(true);
    }
  }
async function doImport() {
  if (!importFile) return;
  try {
    setImportUploading(true);
    setImportErr(null);

    const fd = new FormData();
    fd.append('file', importFile);

    // NO pongas Content-Type manual. Dejalo a axios para setear boundary.
    const cfg = { timeout: 60000 as const };

    // 1) DRY RUN (valida en server sin insertar)
    try {
      await api.post('/transactions/import?dry_run=1', fd, cfg);
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.errors?.length) {
        const rowErrs: Record<number, string> = {};
        for (const it of data.errors) {
          const idx = (it.index ?? 2) - 2; // 1-based + header -> 0-based
          rowErrs[idx] = it.error || 'Fila inválida';
        }
        setImportRowErrors(rowErrs);
        setImportErr('CSV contiene filas inválidas (validación del servidor).');
        return;
      }
      setImportErr(data?.error ?? e.message ?? 'Error de validación en el servidor');
      return;
    }

    // 2) IMPORT REAL
    await api.post('/transactions/import', fd, cfg);

    setImportOpen(false);
    setImportFile(null);
    setImportRows([]);
    setImportRowErrors({});
    await loadData();
    alert('Importación completada');
  } catch (e: any) {
    setImportErr(e?.response?.data?.error ?? e?.message ?? 'No se pudo importar');
  } finally {
    setImportUploading(false);
  }
}



  return (
    <div className="mov-root">
      <h2 className="mov-title">Movimientos <span className="mov-count">{countInfo}</span></h2>

      {/* Acciones rápidas */}
      <div className="mov-quickbar">
        <button className="mov-btn" onClick={()=>openCreate({type:'debit',  fundName:'Los Pipinos'})}>Nuevo egreso — Los Pipinos</button>
        <button className="mov-btn" onClick={()=>openCreate({type:'credit', fundName:'Los Pipinos'})}>Nuevo ingreso — Los Pipinos</button>
        <button className="mov-btn" onClick={()=>openCreate({type:'debit',  fundName:'La Rioja'})}>Nuevo egreso — La Rioja</button>
        <button className="mov-btn" onClick={()=>openCreate({type:'credit', fundName:'La Rioja'})}>Nuevo ingreso — La Rioja</button>
        <button className="mov-btn mov-btn--ghost" onClick={()=>openCreate({type:'debit',  fundName:'Comunes'})}>Nuevo egreso — Común</button>
        <button className="mov-btn mov-btn--ghost" onClick={()=>openCreate({type:'credit', fundName:'Comunes'})}>Nuevo ingreso — Común</button>
      </div>

      {/* Filtros */}
      <div className="mov-filters mov-filters--nosticky">
        <div className="mov-filters-grid">
          <div className="mov-col"><label className="mov-lbl">Desde</label><input className="mov-inp" type="date" value={from} onChange={e=>setFrom(e.target.value)} /></div>
          <div className="mov-col"><label className="mov-lbl">Hasta</label><input className="mov-inp" type="date" value={to} onChange={e=>setTo(e.target.value)} /></div>
          <div className="mov-col"><label className="mov-lbl">Fondo</label>
            <select className="mov-sel" value={fundId} onChange={e=>setFundId(e.target.value)}>
              <option value="">Todos</option>
              {funds.map(f => <option key={f.id} value={f.id}>{f.name ?? f.id}</option>)}
            </select>
          </div>
          {(fundId && (fundId === fundIdRioja || fundId === fundIdPipinos)) && (
            <div className="mov-col">
              <label className="mov-lbl">Comunes</label>
              <label style={{display:'flex', gap:8, alignItems:'center'}}>
                <input type="checkbox" checked={includeComunes} onChange={e=>setIncludeComunes(e.target.checked)} />
                Incluir comunes
              </label>
            </div>
          )}
          <div className="mov-col"><label className="mov-lbl">Tipo</label>
            <select className="mov-sel" value={type} onChange={e=>setType(e.target.value as TxType | '')}>
              <option value="">Todos</option><option value="credit">Crédito</option><option value="debit">Débito</option>
            </select>
          </div>
          <div className="mov-col"><label className="mov-lbl">Categoría</label>
            <select className="mov-sel" value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
              <option value="">Todas</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="mov-col mov-col--search">
            <label className="mov-lbl">Buscar</label>
            <input ref={searchRef} className="mov-inp" placeholder="Descripción, fondo, cuenta…" value={query} onChange={e=>setQuery(e.target.value)} />
          </div>
        </div>

        <div className="mov-filters-actions">
          <div className="mov-filters-shortcuts">
            <button className="mov-btn mov-btn--sm" onClick={()=>quick('7')}>Últimos 7</button>
            <button className="mov-btn mov-btn--sm" onClick={()=>quick('30')}>Últimos 30</button>
            <button className="mov-btn mov-btn--sm" onClick={()=>quick('mtd')}>Mes actual</button>
            <button className="mov-btn mov-btn--sm" onClick={()=>quick('ytd')}>Año actual</button>
            <button className="mov-btn mov-btn--sm" onClick={()=>quick('all')}>Todo</button>
          </div>
          <div className="mov-filters-cta">
            {/* === CSV IMPORT: input oculto + botón === */}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) onPickCSV(f).finally(()=>{ if (fileRef.current) fileRef.current.value=''; });
              }}
            />
            <button className="mov-btn mov-btn--ghost" onClick={()=>fileRef.current?.click()}>
              Importar CSV
            </button>
            {/* === FIN CSV IMPORT === */}

            <button className="mov-btn mov-btn--ghost" onClick={exportCSV}>Exportar CSV</button>
            <button className="mov-btn" onClick={loadData} disabled={loading}>{loading?'Cargando…':'Aplicar filtros'}</button>
          </div>
        </div>
      </div>

      {/* === Cards por fondo === */}
      <div className="mov-fundcards">
        <div className="mov-fundcard">
          <div className="mov-fundcard-title">La Rioja</div>
          <div className={`mov-fundcard-value ${cardRioja.netWithComunes >= 0 ? 'pos':'neg'}`}>{fmtMoney(cardRioja.netWithComunes)}</div>
          <div className="mov-fundcard-sub">Neto (ing − eg − comunes/2)</div>
          <div className="mov-fundcard-meta">
            <span>Ingresos: {cardRioja.ingCount} · {fmtMoney(cardRioja.ingSum)}</span>
            <span>Egresos: {cardRioja.egCount} · {fmtMoney(cardRioja.egSumAbs)}</span>
            <span>Total fondo: {fmtMoney(cardRioja.total)}</span>
          </div>
        </div>

        <div className="mov-fundcard">
          <div className="mov-fundcard-title">Los Pipinos</div>
          <div className={`mov-fundcard-value ${cardPipinos.netWithComunes >= 0 ? 'pos':'neg'}`}>{fmtMoney(cardPipinos.netWithComunes)}</div>
          <div className="mov-fundcard-sub">Neto (ing − eg − comunes/2)</div>
          <div className="mov-fundcard-meta">
            <span>Ingresos: {cardPipinos.ingCount} · {fmtMoney(cardPipinos.ingSum)}</span>
            <span>Egresos: {cardPipinos.egCount} · {fmtMoney(cardPipinos.egSumAbs)}</span>
            <span>Total fondo: {fmtMoney(cardPipinos.total)}</span>
          </div>
        </div>

        <div className="mov-fundcard">
          <div className="mov-fundcard-title">Comunes</div>
          <div className={`mov-fundcard-value ${cardComunes.total >= 0 ? 'pos':'neg'}`}>{fmtMoney(cardComunes.total)}</div>
          <div className="mov-fundcard-sub">Total del fondo (ing − eg)</div>
          <div className="mov-fundcard-meta">
            <span>Ingresos: {cardComunes.ingCount} · {fmtMoney(cardComunes.ingSum)}</span>
            <span>Egresos: {cardComunes.egCount} · {fmtMoney(cardComunes.egSumAbs)}</span>
          </div>
        </div>
      </div>

      {err && <div className="mov-error-msg">Error: {err}</div>}

      {/* Tabla */}
      <div className="mov-tablewrap">
        <table className="mov-table">
          <thead>
            <tr>
              <th className={`mov-th ${sortKey==='tx_date'?'sorted':''}`} onClick={()=>toggleSort('tx_date')}>Fecha</th>
              <th className="mov-th">Fondo</th>
              <th className="mov-th">Categoría</th>
              <th className="mov-th">Cuenta</th>
              <th className="mov-th">Moneda</th>
              <th className={`mov-th mov-td--right ${sortKey==='amount'?'sorted':''}`} onClick={()=>toggleSort('amount')}>Importe</th>
              <th className="mov-th">Tipo</th>
              <th className="mov-th">Descripción</th>
              <th className="mov-th">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.id}>
                <td className="mov-td">{fmtDate(r.tx_date)}</td>
                <td className="mov-td">{r.fund_name ?? (r.fund_id ? fundById[r.fund_id] : '')}</td>
                <td className="mov-td">{r.category_name ?? (r.category_id ? categoryById[r.category_id] : '')}</td>
                <td className="mov-td">{r.account_name ?? (r.account_id ? accountById[r.account_id] : '')}</td>
                <td className="mov-td">{r.currency ?? ''}</td>
                <td className="mov-td mov-td--right">{fmtMoney(r.amount)}</td>
                <td className="mov-td">
                  {r.type ? <span className={`mov-tag ${r.type==='debit'?'mov-tag--debit':'mov-tag--credit'}`}>{r.type}</span> : '—'}
                </td>
                <td className="mov-td">{r.description}</td>
                <td className="mov-td">
                  <button className="mov-btn mov-btn--sm" onClick={()=>openEdit(r)}>Editar</button>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td className="mov-td" colSpan={9} style={{ textAlign:'center', opacity:.7, padding:'24px 0' }}>No hay resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="mov-pagination">
        <button className="mov-btn mov-btn--ghost" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>←</button>
        <span>Página {page}</span>
        <button className="mov-btn mov-btn--ghost" disabled={start+pageSize>=sorted.length} onClick={()=>setPage(p=>p+1)}>→</button>
        <select className="mov-sel" value={pageSize} onChange={e=>{ setPageSize(Number(e.target.value)); setPage(1); }}>
          {[25,50,100,200].map(n=><option key={n} value={n}>{n} / pág</option>)}
        </select>
      </div>

      {/* MODAL: Crear */}
      {showCreate && (
        <div className="mov-modal-backdrop" onClick={()=>setShowCreate(false)} role="dialog" aria-modal="true">
          <div className="mov-modal" onClick={e=>e.stopPropagation()} style={{maxWidth: 720}}>
            <h3 className="mov-modal-title">Nuevo {form.type === 'debit' ? 'egreso' : 'ingreso'}</h3>

            <div className="mov-form-grid">
              <div className="mov-col">
                <label className="mov-lbl">Tipo</label>
                <select
                  className="mov-sel"
                  value={form.type}
                  onChange={(e)=>setForm(f=>({ ...f, type: e.target.value as 'credit'|'debit' }))}
                >
                  <option value="credit">Crédito (ingreso)</option>
                  <option value="debit">Débito (egreso)</option>
                </select>
              </div>

              <div className="mov-col">
                <label className="mov-lbl">Fondo</label>
                <select
                  className="mov-sel"
                  value={form.fund_id}
                  onChange={(e)=>setForm(f=>({ ...f, fund_id: e.target.value }))}
                >
                  <option value="">Seleccioná…</option>
                  {funds.map(f => <option key={f.id} value={f.id}>{f.name ?? f.id}</option>)}
                </select>
              </div>

              <div className="mov-col">
                <label className="mov-lbl">Cuenta</label>
                <select
                  className="mov-sel"
                  value={form.account_id}
                  onChange={(e)=>onChangeAccountCreate(e.target.value)}
                >
                  <option value="">Seleccioná…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="mov-col">
                <label className="mov-lbl">Fecha</label>
                <input className="mov-inp" type="date" value={form.tx_date} onChange={(e)=>setForm(f=>({ ...f, tx_date: e.target.value }))} />
              </div>

              <div className="mov-col">
                <label className="mov-lbl">Categoría</label>
                <select
                  className="mov-sel"
                  value={form.category_id ?? ''}
                  onChange={(e)=>setForm(f=>({ ...f, category_id: e.target.value || null }))}
                >
                  <option value="">(sin categoría)</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="mov-col">
                <label className="mov-lbl">Importe</label>
                <input className="mov-inp" type="number" step="0.01" min="0" value={form.amount} onChange={(e)=>setForm(f=>({ ...f, amount: e.target.value }))} />
              </div>

              <div className="mov-col mov-col--full">
                <label className="mov-lbl">Descripción</label>
                <input className="mov-inp" value={form.description} onChange={(e)=>setForm(f=>({ ...f, description: e.target.value }))} />
              </div>
            </div>

            {/* Asociación opcional a factura (solo ingresos) */}
            {form.type === 'credit' && (
              <div className="mov-panel">
                <label style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
                  <input
                    type="checkbox"
                    checked={!!form.link_invoice}
                    onChange={(e)=>setForm(f=>({ ...f, link_invoice: e.target.checked }))}
                  />
                  Asociar a una factura pendiente
                </label>

                {form.link_invoice && (
                  <div className="mov-col">
                    <label className="mov-lbl">Factura</label>
                    {pendingLoading ? (
                      <div style={{opacity:.7}}>Cargando facturas…</div>
                    ) : pendingErr ? (
                      <div className="mov-error-msg">Error: {pendingErr}</div>
                    ) : (
                      <select
                        className="mov-sel"
                        value={form.invoice_id ?? ''}
                        onChange={(e)=>setForm(f=>({ ...f, invoice_id: e.target.value || null }))}
                        disabled={!pendingInvoices.length}
                      >
                        <option value="">{pendingInvoices.length ? 'No asociar' : 'No hay pendientes'}</option>
                        {pendingInvoices.map(inv => (
                          <option key={inv.id} value={inv.id}>
                            {inv.numero} — {inv.client_name ?? 's/cliente'} — {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_total ?? 0)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mov-modal-actions">
              <button className="mov-btn mov-btn--ghost" onClick={()=>setShowCreate(false)}>Cancelar</button>
              <button className="mov-btn" onClick={submitCreate}>Crear</button>
            </div>
          </div>
        </div>
      )}
      {/* FIN MODAL: Crear */}

      {/* MODAL: Editar */}
      {editing && editForm && (
        <div className="mov-modal-backdrop" onClick={()=>(!savingEdit && setEditing(null), setEditForm(null))} role="dialog" aria-modal="true">
          <div className="mov-modal" onClick={e=>e.stopPropagation()} style={{maxWidth: 720}}>
            <h3 className="mov-modal-title">Editar movimiento</h3>

            <div className="mov-form-grid">
              <div className="mov-col">
                <label className="mov-lbl">Tipo</label>
                <select
                  className="mov-sel"
                  value={editForm.type}
                  onChange={(e)=>setEditForm(f=>f ? ({ ...f, type: e.target.value as 'credit'|'debit' }) : f)}
                >
                  <option value="credit">Crédito (ingreso)</option>
                  <option value="debit">Débito (egreso)</option>
                </select>
              </div>

              <div className="mov-col">
                <label className="mov-lbl">Fondo</label>
                <select
                  className="mov-sel"
                  value={editForm.fund_id}
                  onChange={(e)=>setEditForm(f=>f ? ({ ...f, fund_id: e.target.value }) : f)}
                >
                  <option value="">Seleccioná…</option>
                  {funds.map(f => <option key={f.id} value={f.id}>{f.name ?? f.id}</option>)}
                </select>
              </div>

              <div className="mov-col">
                <label className="mov-lbl">Cuenta</label>
                <select
                  className="mov-sel"
                  value={editForm.account_id}
                  onChange={(e)=>onChangeAccountEdit(e.target.value)}
                >
                  <option value="">Seleccioná…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="mov-col">
                <label className="mov-lbl">Fecha</label>
                <input className="mov-inp" type="date" value={editForm.tx_date} onChange={(e)=>setEditForm(f=>f ? ({ ...f, tx_date: e.target.value }) : f)} />
              </div>

              <div className="mov-col">
                <label className="mov-lbl">Categoría</label>
                <select
                  className="mov-sel"
                  value={editForm.category_id ?? ''}
                  onChange={(e)=>setEditForm(f=>f ? ({ ...f, category_id: e.target.value || null }) : f)}
                >
                  <option value="">(sin categoría)</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="mov-col">
                <label className="mov-lbl">Importe</label>
                <input className="mov-inp" type="number" step="0.01" min="0" value={editForm.amount} onChange={(e)=>setEditForm(f=>f ? ({ ...f, amount: e.target.value }) : f)} />
              </div>

              <div className="mov-col mov-col--full">
                <label className="mov-lbl">Descripción</label>
                <input className="mov-inp" value={editForm.description ?? ''} onChange={(e)=>setEditForm(f=>f ? ({ ...f, description: e.target.value }) : f)} />
              </div>
            </div>

            <div className="mov-modal-actions">
              <button className="mov-btn mov-btn--danger" onClick={confirmDelete}>Eliminar</button>
              <div style={{flex:1}} />
              <button className="mov-btn mov-btn--ghost" onClick={()=>{ setEditing(null); setEditForm(null); }} disabled={savingEdit}>Cancelar</button>
              <button className="mov-btn" onClick={submitEdit} disabled={savingEdit}>{savingEdit ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
      {/* FIN MODAL: Editar */}

      {/* MODAL: Importar CSV (previsualización) */}
      {importOpen && (
        <div className="mov-modal-backdrop" onClick={()=>!importUploading && setImportOpen(false)} role="dialog" aria-modal="true">
          <div className="mov-modal" onClick={e=>e.stopPropagation()} style={{maxWidth: 'min(1100px, 96vw)'}}>
            <h3 className="mov-modal-title">Importar CSV — Previsualización</h3>

            <div style={{marginBottom: 8, fontSize: 12, opacity: .8}}>
              Encabezados requeridos: <code>{['account_id','date','description','amount','type','category_id','fund_id'].join(', ')}</code>
            </div>

            {importErr && <div className="mov-error-msg">Error: {importErr}</div>}

                <div style={{fontSize:12, opacity:.8, marginBottom:8}}>
                  {Object.keys(importRowErrors).length > 0
                    ? `${Object.keys(importRowErrors).length} filas con error · ${importRows.length - Object.keys(importRowErrors).length} válidas`
                    : `Todas las ${importRows.length} filas pasan la validación local`}
                </div>
            {importRows.length > 0 ? (

              <div className="mov-tablewrap" style={{maxHeight: 420}}>
                <table className="mov-table">
                  <thead>
                    <tr>
                      <th className="mov-th">account_id</th>
                      <th className="mov-th">date</th>
                      <th className="mov-th">description</th>
                      <th className="mov-th mov-td--right">amount</th>
                      <th className="mov-th">type</th>
                      <th className="mov-th">category_id</th>
                      <th className="mov-th">fund_id</th>
                       <th className="mov-th">Error</th> {/* NUEVO */}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 100).map((r, i) => (
                      <tr key={i} className={importRowErrors[i] ? 'row-error' : ''}>
                        <td className="mov-td mov-td--mono">{r.account_id}</td>
                        <td className="mov-td">{r.date}</td>
                        <td className="mov-td">{r.description}</td>
                        <td className="mov-td mov-td--right">{r.amount}</td>
                        <td className="mov-td">
                          {r.type
                            ? <span className={`mov-tag ${r.type==='debit'?'mov-tag--debit':'mov-tag--credit'}`}>{r.type}</span>
                            : '—'}
                        </td>
                        <td className="mov-td mov-td--mono">{r.category_id}</td>
                        <td className="mov-td mov-td--mono">{r.fund_id}</td>
                        <td className="mov-td" style={{color: importRowErrors[i] ? '#b00020' : '#4caf50'}}>
                          {importRowErrors[i] ? importRowErrors[i] : 'OK'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importRows.length > 100 && (
                  <div style={{padding:'8px 0', fontSize:12, opacity:.8}}>
                    Mostrando primeras 100 filas de {importRows.length}.
                  </div>
                )}
              </div>
            ) : (
              !importErr && <div style={{padding:'16px 0', opacity:.8}}>Seleccioná un archivo CSV para ver la previsualización.</div>
            )}

            <div className="mov-modal-actions">
              <button className="mov-btn mov-btn--ghost" onClick={()=>!importUploading && setImportOpen(false)} disabled={importUploading}>Cancelar</button>
              <button className="mov-btn" onClick={doImport} disabled={importUploading || !importFile || importRows.length===0}>
                {importUploading ? 'Importando…' : 'Confirmar importación'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* FIN MODAL: Importar CSV */}
    </div>
  );
}
