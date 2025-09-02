import React, { useEffect, useRef, useState } from 'react';
import { buildFacturaNumber, parseFacturaNumber, isFacturaNumberValid } from '../../lib/api';

type Props = {
  value: string;                   // A000200001414 (sin guiones)
  onChange: (val: string) => void; // devolvemos siempre concatenado sin guiones
  error?: string | null;
};

export function FacturaNumberInput({ value, onChange, error }: Props) {
  // Estado interno inicial a partir de value (una sola vez)
  const init = parseFacturaNumber(value);
  const [tipo, setTipo] = useState(init.tipo || '');
  const [pv, setPv] = useState(init.pv);
  const [seq, setSeq] = useState(init.seq);

  const refTipo = useRef<HTMLInputElement>(null);
  const refPv   = useRef<HTMLInputElement>(null);
  const refSeq  = useRef<HTMLInputElement>(null);

  // 1) Solo sincronizar desde el prop `value` si realmente cambió "desde afuera".
  useEffect(() => {
    const normalizedProp = buildFacturaNumber(
      parseFacturaNumber(value).tipo,
      parseFacturaNumber(value).pv,
      parseFacturaNumber(value).seq
    );
    const internal = buildFacturaNumber(tipo, pv, seq);

    if (normalizedProp && normalizedProp !== internal) {
      const p = parseFacturaNumber(value);
      setTipo(p.tipo || '');
      setPv(p.pv);
      setSeq(p.seq);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]); // no dependemos de tipo/pv/seq para no disparar bucles

  // 2) Cuando cambia el estado interno, notificamos al padre (si hubo cambio real)
  useEffect(() => {
    const next = buildFacturaNumber(tipo, pv, seq);
    onChange(next);
  }, [tipo, pv, seq, onChange]);

  const onTipoChange = (v: string) => {
    const t = v.toUpperCase().replace(/[^ABC]/g, '').slice(0, 1);
    setTipo(t);
    if (t.length === 1) refPv.current?.focus();
  };

  const onPvChange = (v: string) => {
    const n = v.replace(/\D/g, '').slice(0, 4);
    setPv(n);
    if (n.length === 4) refSeq.current?.focus();
  };
  const onPvKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Backspace' && !pv) refTipo.current?.focus();
  };

  const onSeqChange = (v: string) => {
    const n = v.replace(/\D/g, '').slice(0, 8);
    setSeq(n);
  };
  const onSeqKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Backspace' && !seq) refPv.current?.focus();
  };

  const valid = isFacturaNumberValid(buildFacturaNumber(tipo, pv, seq));

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        ref={refTipo}
        value={tipo}
        onChange={(e) => onTipoChange(e.target.value)}
        placeholder="A/B/C"
        maxLength={1}
        className="prv-inp"
        style={{ width: 64, textTransform: 'uppercase', textAlign: 'center' }}
      />
      <span>–</span>
      <input
        ref={refPv}
        value={pv}
        onChange={(e) => onPvChange(e.target.value)}
        onKeyDown={onPvKeyDown}
        placeholder="0000"
        inputMode="numeric"
        className="prv-inp"
        style={{ width: 96, textAlign: 'center' }}
      />
      <span>–</span>
      <input
        ref={refSeq}
        value={seq}
        onChange={(e) => onSeqChange(e.target.value)}
        onKeyDown={onSeqKeyDown}
        placeholder="00000000"
        inputMode="numeric"
        className="prv-inp"
        style={{ width: 140, textAlign: 'center' }}
      />
      {!valid && <span style={{ color: '#b00020', marginLeft: 8 }}>{error ?? 'N° inválido'}</span>}
    </div>
  );
}
