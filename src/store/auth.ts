// src/store/auth.ts
import { create } from 'zustand';
import api from '../lib/api';

type MeResponse = {
  user: { id: string; email: string; full_name: string | null; is_active: boolean; created_at: string };
  roles: string[];
  fund_access: { fund_id: string; scope: 'read'|'write'|'admin' }[];
};

type User = {
  id: string;
  email: string;
  full_name: string | null;
  roles: string[];
};

type AuthState = {
  user: User | null;
  loading: boolean;
  meLoading: boolean;
  meLoaded: boolean;
  error: string | null;
  // 👉 opcional: guardá fund_access si lo vas a usar en el front
  fundAccess: { fund_id: string; scope: 'read'|'write'|'admin' }[];

  login: (email: string, password: string) => Promise<void>;
  fetchMe: () => Promise<void>;
  logout: () => void;
};

let meInFlight: Promise<void> | null = null;

function parseUser(me: MeResponse): User {
  return {
    id: me.user.id,
    email: me.user.email,
    full_name: me.user.full_name,
    roles: me.roles ?? [],
  };
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  meLoading: false,
  meLoaded: false,
  error: null,
  fundAccess: [],

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', data.token);
      set({
        user: { id: data.user.id, email: data.user.email, full_name: data.user.full_name ?? null, roles: [] },
        loading: false,
      });
      await get().fetchMe();
    } catch (e: any) {
      set({ error: e?.response?.data?.error ?? 'Login failed', loading: false });
      throw e;
    }
  },

  fetchMe: async () => {
    const token = localStorage.getItem('token');
    if (!token) { set({ meLoaded: true, meLoading: false }); return; }
    if (get().meLoading) return;
    set({ meLoading: true, error: null });

    if (meInFlight) { await meInFlight; return; }
    meInFlight = (async () => {
      try {
        const { data } = await api.get<MeResponse>('/me');
        set({
          user: parseUser(data),
          fundAccess: data.fund_access ?? [],
          meLoaded: true,
          meLoading: false
        });
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 401) {
          localStorage.removeItem('token');
          set({ user: null, meLoaded: true, meLoading: false, error: 'Sesión expirada' });
        } else {
          set({ meLoaded: true, meLoading: false, error: e?.response?.data?.error ?? 'Auth error' });
        }
      } finally {
        meInFlight = null;
      }
    })();
    await meInFlight;
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, fundAccess: [], meLoaded: false, meLoading: false, error: null });
  },
}));

// ✅ Selectores/hook reutilizables
export const selectIsAdmin = (s: AuthState) => {
  const r = s.user?.roles ?? [];
  return r.some(x => {
    const v = x.toLowerCase();
    return v === 'admin' || v === 'owner';
  });
};

export const useIsAdmin = () => useAuth(selectIsAdmin);
