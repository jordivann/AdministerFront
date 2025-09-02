import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import "./styles/Login.css";

export default function Login() {
  const nav = useNavigate();
  const { login, error, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const pwdRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setCapsOn(e.getModifierState?.("CapsLock") ?? false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email.trim(), password);
      nav("/");
    } catch {}
  }

  return (
    <div className="lg-wrap">
      <main className="lg-card" aria-labelledby="login-title">
        <header className="lg-head">
          <div className="lg-logo" aria-hidden="true">🔐</div>
          <h1 id="login-title">Iniciar sesión</h1>
          <p className="lg-sub">Accedé a tu panel de forma segura</p>
        </header>

        <form onSubmit={onSubmit} autoComplete="on" className="lg-form" noValidate>
          <div className="lg-field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              placeholder="tucorreo@dominio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="lg-field">
            <label htmlFor="password">Contraseña</label>
            <div className="lg-pwd">
              <input
                ref={pwdRef}
                id="password"
                name="password"
                type={showPwd ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-describedby={capsOn ? "caps-hint" : undefined}
              />
              <button
                type="button"
                className="lg-ghost"
                onClick={() => setShowPwd((s) => !s)}
                aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                title={showPwd ? "Ocultar" : "Mostrar"}
              >
                {showPwd ? "🙈" : "👁️"}
              </button>
            </div>
            {capsOn && (
              <div id="caps-hint" className="lg-warn">Bloq Mayús activado</div>
            )}
          </div>

          {error && (
            <div role="alert" className="lg-callout lg-error">
              {error}
            </div>
          )}

          <button className="lg-cta" disabled={loading} type="submit">
            {loading ? (
              <>
                <span className="lg-spinner" aria-hidden="true" />
                Ingresando…
              </>
            ) : (
              "Ingresar"
            )}
          </button>
        </form>

        <footer className="lg-foot">
          <a className="lg-link" href="/auth/forgot">¿Olvidaste tu contraseña?</a>
        </footer>
      </main>
    </div>
  );
}
