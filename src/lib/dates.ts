// Zona por defecto
export const AR_TZ = 'America/Argentina/Buenos_Aires';

// ¿Es YYYY-MM-DD?
export function isYMD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Muestra DD/MM/AAAA en horario de AR, sin hora */
export function fmtDateAR(s?: string|null){
  if(!s) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {           // fecha pura
    const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`;
  }
  const d = new Date(s);                          // ISO con Z
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

/** Devuelve YYYY-MM-DD según AR (útil para filtros “hoy”, “30d”, etc.) */
export function ymdInAR(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value ?? '0000';
  const m = parts.find(p => p.type === 'month')?.value ?? '01';
  const day = parts.find(p => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}
