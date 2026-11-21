import clsx from 'clsx';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui';
import { parseQr } from '../../lib/qr';
import { enqueueHandoff, newClientId } from '../../offline/outbox';
import type { HandoffCondition, HandoffType } from '../../types';
import { QrScanner } from './QrScanner';
import { SignaturePad } from './SignaturePad';

/**
 * Chain-of-custody sign-off: scan QR → PIN → condition → signature → save.
 * Always saved to the on-device outbox first, so it works with no signal.
 */

function getPosition(): Promise<{ lat: number | null; lng: number | null }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

const conditions: { value: HandoffCondition; label: string; tone: string }[] = [
  { value: 'intact', label: 'Intact', tone: 'border-ok bg-ok-bg' },
  { value: 'damaged', label: 'Damaged', tone: 'border-warn bg-warn-bg' },
  { value: 'temperature_compromised', label: 'Temp compromised', tone: 'border-crit bg-crit-bg' },
];

export function HandoffPage({ type, backTo }: { type: HandoffType; backTo: string }) {
  const { id: routeShipmentId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<'scan' | 'details'>('scan');
  const [qrPayload, setQrPayload] = useState('');
  const [shipmentId, setShipmentId] = useState('');
  const [pin, setPin] = useState('');
  const [condition, setCondition] = useState<HandoffCondition | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function onScan(text: string) {
    const scanned = parseQr(text);
    if (routeShipmentId && scanned !== routeShipmentId) {
      setScanError('This QR code is for a different shipment.');
      return;
    }
    setScanError(null);
    setQrPayload(text);
    setShipmentId(scanned);
    setStep('details');
  }

  const pinValid = /^\d{4,6}$/.test(pin);
  const ready = pinValid && condition && signature;

  async function save() {
    if (!ready) return;
    setSaving(true);
    const { lat, lng } = await getPosition();
    await enqueueHandoff({
      clientId: newClientId(),
      shipmentId,
      type,
      qrPayload,
      pin,
      signatureDataUrl: signature,
      condition,
      lat,
      lng,
      recordedAtIso: new Date().toISOString(),
    });
    setSaving(false);
    setSaved(true);
  }

  if (saved) {
    return (
      <div className="space-y-4 rounded-xl border border-line bg-white p-6 text-center shadow-card">
        <p className="text-5xl" aria-hidden>✓</p>
        <h1 className="text-2xl font-bold">{type === 'pickup' ? 'Pickup' : 'Delivery'} recorded</h1>
        <p className="text-lg text-muted">Saved on this phone. It will sync automatically when you have signal.</p>
        <Button size="xl" className="w-full" onClick={() => navigate(backTo)}>Done</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{type === 'pickup' ? 'Pickup handoff' : 'Delivery handoff'}</h1>
        <Link to={backTo} className="min-h-11 px-2 py-2 text-brand-link">Cancel</Link>
      </div>

      {step === 'scan' ? (
        <>
          <p className="text-lg">Scan the QR code on the shipment box.</p>
          {scanError && <p role="alert" className="rounded-lg bg-crit-bg p-3 text-lg font-semibold text-crit-text">{scanError}</p>}
          <QrScanner onScan={onScan} />
        </>
      ) : (
        <>
          <p className="rounded-lg bg-white p-3 text-lg">
            Shipment <b className="text-code">{shipmentId}</b>{' '}
            <button className="ml-2 text-brand-link underline" onClick={() => setStep('scan')}>Rescan</button>
          </p>

          <label className="block">
            <span className="mb-1 block text-lg font-semibold">{type === 'pickup' ? 'Warehouse PIN' : 'Clinic PIN'}</span>
            <input
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              autoComplete="one-time-code"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="block min-h-16 w-full rounded-xl border-2 border-line bg-white px-4 text-center font-mono text-3xl tracking-[0.5em] focus:border-brand focus:outline-none"
              aria-describedby="pin-hint"
            />
            <span id="pin-hint" className="text-sm text-faint">4–6 digits</span>
          </label>

          <fieldset>
            <legend className="mb-2 text-lg font-semibold">Condition</legend>
            <div className="grid gap-2">
              {conditions.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={condition === c.value}
                  onClick={() => setCondition(c.value)}
                  className={clsx(
                    'min-h-14 rounded-xl border-2 px-4 text-left text-lg font-semibold',
                    condition === c.value ? c.tone + ' ring-4 ring-brand/20' : 'border-line bg-white',
                  )}
                >
                  {condition === c.value ? '● ' : '○ '}
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <p className="mb-2 text-lg font-semibold">Signature</p>
            <SignaturePad onChange={setSignature} />
          </div>

          <Button size="xl" className="w-full" disabled={!ready} loading={saving} onClick={save}>
            Confirm {type}
          </Button>
        </>
      )}
    </div>
  );
}
