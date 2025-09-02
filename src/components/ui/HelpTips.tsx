import { useEffect, useRef, useState } from 'react';
import './styles/HelpTips.css';

type TipItem =
  | string
  | { text: string; href?: string; target?: '_blank' | '_self' | '_parent' | '_top'; rel?: string };

type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

type HelpTipsProps = {
  tips: TipItem[];
  title?: string;
  position?: Position;
  autoHideMs?: number; // default 10000
};

export default function HelpTips({
  tips,
  title = 'Tips',
  position = 'bottom-right',
  autoHideMs = 10000,
}: HelpTipsProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const startTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(false), autoHideMs);
  };
  const clearTimer = () => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => {
    if (!open) { clearTimer(); return; }
    startTimer();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!dialogRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open, autoHideMs]);

  useEffect(() => () => clearTimer(), []);

  const posClass =
    position === 'bottom-right' ? 'help-tips--br' :
    position === 'bottom-left'  ? 'help-tips--bl' :
    position === 'top-right'    ? 'help-tips--tr' :
                                  'help-tips--tl';

  return (
    <div
      className={`help-tips ${posClass}`}
      data-open={open ? 'true' : 'false'}
      style={{ ['--ht-timer' as any]: `${autoHideMs}ms` }}
      aria-live="polite"
    >
      <button
        ref={btnRef}
        type="button"
        className="help-tips-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="help-tips-dialog"
        onClick={() => setOpen(v => !v)}
        title="Ver tips"
      >
        <span className="help-tips-button__icon" aria-hidden>?</span>
        <span className="help-tips-button__sr">Mostrar tips</span>
      </button>

      {open && (
        <div
          id="help-tips-dialog"
          ref={dialogRef}
          className="help-tips-dialog"
          role="dialog"
          aria-modal="false"
          aria-labelledby="help-tips-title"
          onMouseEnter={clearTimer}
          onMouseLeave={startTimer}
        >
          <div className="help-tips-dialog__header">
            <h3 className="help-tips-dialog__title" id="help-tips-title">{title}</h3>
            <button
              type="button"
              className="help-tips-dialog__close"
              aria-label="Cerrar tips"
              onClick={() => { setOpen(false); btnRef.current?.focus(); }}
              title="Cerrar"
            >
              <span aria-hidden>×</span>
            </button>
          </div>

          <ul className="help-tips-list">
            {tips.map((tip, i) => {
              const item = typeof tip === 'string' ? { text: tip } : tip;
              return (
                <li key={i} className="help-tips-list__item">
                  {item.href ? (
                    <a
                      className="help-tips-link"
                      href={item.href}
                      target={item.target ?? '_blank'}
                      rel={item.rel ?? 'noopener noreferrer'}
                    >
                      {item.text}
                    </a>
                  ) : (
                    <span className="help-tips-text">{item.text}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
