import { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';

/**
 * Camera barcode/QR scanner (rear camera). Calls onCode for each new code;
 * ignores the same code for 2.5s so one item isn't counted twice.
 * Pause it (paused=true) while a sheet is open.
 */
export function Scanner({ onCode, paused }: { onCode: (code: string) => void; paused?: boolean }) {
  const [error, setError] = useState('');
  const last = useRef({ code: '', at: 0 });
  const cb = useRef(onCode);
  cb.current = onCode;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let scanner: any;
    let stopped = false;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera needs the app to be opened over HTTPS. You can still type or use a Bluetooth scanner below.');
      return;
    }
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (stopped) return;
      scanner = new Html5Qrcode('instore-scanner', { verbose: false } as any);
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w: number, h: number) => ({ width: Math.min(280, w * 0.85), height: Math.min(160, h * 0.6) }), aspectRatio: 1.6 },
        (code: string) => {
          if (pausedRef.current) return;
          const now = Date.now();
          if (code === last.current.code && now - last.current.at < 2500) return;
          last.current = { code, at: now };
          cb.current(code);
        },
        () => {},
      ).catch((e: any) => setError(/permission|notallowed/i.test(String(e)) ? 'Camera permission was denied. Allow camera access for this app in iPhone Settings → Safari → Camera.' : `Camera not available: ${String(e?.message ?? e)}`));
    });
    return () => {
      stopped = true;
      if (scanner?.isScanning) scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-ink">
      {error ? (
        <div className="flex aspect-[1.6] flex-col items-center justify-center gap-2 bg-mint p-6 text-center text-sm text-muted">
          <CameraOff size={28} /> {error}
        </div>
      ) : (
        <div id="instore-scanner" className="aspect-[1.6] [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
      )}
    </div>
  );
}
