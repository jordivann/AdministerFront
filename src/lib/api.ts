// src/lib/api.ts
import axios, { AxiosError } from 'axios';

/** ========= Config ========= **/
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// Inyectar token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Manejo básico de 401 (salvo login)
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<any>) => {
    const status = error.response?.status;
    const url = (error.config?.url ?? '') as string;
    if (status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem('token');
    }
    return Promise.reject(error);
  }
);

/** ========= Tipos ========= **/
export type LoginResponse = { token: string };

export type MeResponse = {
  user: { id: string; email: string; full_name: string | null; is_active: boolean; created_at: string };
  roles: string[];
  fund_access: { fund_id: string; scope: 'read' | 'write' | 'admin' }[];
};

export type Fund = { id: string; name: string; is_active: boolean };

export type Transaction = {
  id: string;
  account_id: string;
  fund_id?: string | null;
  currency: string;
  amount: number;
  description: string | null;
  tx_date: string; // YYYY-MM-DD
};

export type TxFilters = {
  from?: string;       // YYYY-MM-DD
  to?: string;         // YYYY-MM-DD
  fund_id?: string;
  account_id?: string;
};

// helper para construir query strings limpios
function buildQuery(params: Record<string, any>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** ========= Wrappers ========= **/
export const AuthAPI = {
  login(email: string, password: string) {
    return api.post<LoginResponse>('/auth/login', { email, password }).then(r => r.data);
  },
  me() {
    return api.get<MeResponse>('/me').then(r => r.data);
  },
  logout() {
    localStorage.removeItem('token');
  },
};

export const FundsAPI = {
  list() {
    return api.get<Fund[]>('/funds').then(r => r.data);
  },
};

export const TransactionsAPI = {
  list(filters: TxFilters = {}) {
    return api.get<Transaction[]>(`/transactions${buildQuery(filters)}`).then(r => r.data);
  },
  create(payload: {
    account_id: string;
    tx_date: string;          // YYYY-MM-DD
    currency: string;
    amount: number;
    description?: string;
    allocations?: { fund_id: string; ratio: number }[]; // si tu back lo soporta
  }) {
    return api.post<{ id: string }>('/transactions', payload).then(r => r.data);
  },
};

/* TIPO DE FACTURA */
// --- helpers de formato/parseo de números de factura ---
export type FacturaTipo = 'A' | 'B' | 'C';

export function facturaTipo(num: string): FacturaTipo | null {
  const clean = String(num || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const m = clean.match(/^([ABC])(\d{4})(\d{8})$/);
  return m ? (m[1] as FacturaTipo) : null;
}



export function parseFacturaNumber(num: string) {
  const clean = String(num || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const m = clean.match(/^([ABC])(\d{0,4})(\d{0,8})$/) || clean.match(/^([ABC])(\d{4})(\d{8})$/);
  if (m) {
    return { tipo: m[1] as FacturaTipo, pv: m[2] || '', seq: m[3] || '' };
  }
  return { tipo: '' as any, pv: '', seq: '' };
}

export function buildFacturaNumber(tipo?: string, pv?: string, seq?: string) {
  const t = (tipo || '').toUpperCase().replace(/[^ABC]/g, '').slice(0, 1);
  const p = (pv || '').replace(/\D/g, '').slice(0, 4);
  const s = (seq || '').replace(/\D/g, '').slice(0, 8);
  return t + p.padStart(4, '0') + s.padStart(8, '0');
}

export function prettyFactura(num: string) {
  const clean = String(num || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const m = clean.match(/^([ABC])(\d{4})(\d{8})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : num || '—';
}

export function isFacturaNumberValid(num: string) {
  return /^[ABC]\d{4}\d{8}$/.test(String(num || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase());
}


export default api;
