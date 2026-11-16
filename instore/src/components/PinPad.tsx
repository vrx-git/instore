import { useEffect, useState } from 'react';
import { Delete } from 'lucide-react';

/** 4-digit PIN entry with dots and a number pad. Calls onComplete when 4 digits are entered. */
export function PinPad({ onComplete, error, disabled }: { onComplete: (pin: string) => void; error?: string; disabled?: boolean }) {
  const [pin, setPin] = useState('');
  useEffect(() => { if (error) setPin(''); }, [error]);
  const press = (d: string) => {
    if (disabled || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) setTimeout(() => onComplete(next), 80);
  };
  // physical keyboard support
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  return (
    <div className="flex flex-col items-center">
      <div className={`mb-2 flex gap-4 ${error ? 'animate-[shake_.3s]' : ''}`} aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 ${i < pin.length ? 'border-primary bg-primary' : 'border-line'}`} />)}
      </div>
      <div className="mb-4 h-5 text-sm text-out">{error}</div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <Key key={d} onClick={() => press(d)}>{d}</Key>)}
        <span />
        <Key onClick={() => press('0')}>0</Key>
        <button className="flex h-[72px] w-[72px] items-center justify-center text-muted active:opacity-60" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete digit"><Delete size={26} /></button>
      </div>
      <style>{'@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}'}</style>
    </div>
  );
}

function Key({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-mint text-[28px] font-medium text-ink active:bg-line" aria-label={`Digit ${children}`}>
      {children}
    </button>
  );
}
