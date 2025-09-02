// src/pages/Login.tsx
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function Login() {
  const nav = useNavigate();
  const { login, error, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email.trim(), password);
      nav('/');
    } catch {}
  }

  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: 24, border: '1px solid #eee', borderRadius: 8 }}>
      <h2>Iniciar sesión</h2>
      <form onSubmit={onSubmit} autoComplete="on">
        <div style={{ marginBottom: 12 }}>
          <label>Email</label><br />
          <input
            value={email}
            onChange={e=>setEmail(e.target.value)}
            type="email"
            placeholder="admin@example.com"
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Password</label><br />
          <input
            value={password}
            onChange={e=>setPassword(e.target.value)}
            type="password"
            placeholder="••••••"
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        {error && <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>}
        <button disabled={loading} type="submit" style={{ padding: '8px 12px' }}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
