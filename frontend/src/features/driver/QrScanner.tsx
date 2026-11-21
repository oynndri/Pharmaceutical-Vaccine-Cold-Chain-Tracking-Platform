import { Html5Qrcode } from 'html5-qrcode';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { inputClass } from '../../components/ui/styles';

/** Camera QR scanner with a typed fallback (no camera, permission denied, or damaged label). */
export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const regionId = 'qr-' + useId().replace(/:/g, '');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const scanner = new Html5Qrcode(regionId, { verbose: false });
    let stopped = false;
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          if (stopped) return;
          stopped = true;
          scanner.stop().catch(() => {}).finally(() => onScanRef.current(text));
        },
        () => {},
      )
      .catch((err: unknown) => setCameraError(err instanceof Error ? err.message : 'Camera unavailable'));
    return () => {
      if (!stopped && scanner.isScanning) {
        stopped = true;
        scanner.stop().catch(() => {});
      }
    };
  }, [regionId]);

  return (
    <div className="space-y-3">
      <div id={regionId} className="aspect-square w-full overflow-hidden rounded-xl bg-navy-900" />
      {cameraError && (
        <p className="rounded-lg border border-warn-line bg-warn-bg p-3 text-warn-text">Camera not available ({cameraError}). Type the code below.</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onScan(manual.trim());
        }}
      >
        <input
          className={`${inputClass} min-h-14 text-lg`}
          placeholder="Or type shipment code"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          aria-label="Shipment code"
        />
        <Button type="submit" size="xl" variant="secondary">Use</Button>
      </form>
    </div>
  );
}
