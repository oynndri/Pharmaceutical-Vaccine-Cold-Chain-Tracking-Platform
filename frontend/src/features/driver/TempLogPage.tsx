import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui';
import { enqueueTempLog, newClientId } from '../../offline/outbox';

const big = 'block min-h-16 w-full rounded-xl border-2 border-line bg-white px-4 text-2xl focus:border-brand focus:outline-none';

/** Manual temperature log (backup to the IoT sensor). Saved offline-first. */
export function TempLogPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [temp, setTemp] = useState('');
  const [humidity, setHumidity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const tempNum = Number(temp);
  const valid = temp !== '' && Number.isFinite(tempNum) && tempNum > -40 && tempNum < 60;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    await enqueueTempLog({
      clientId: newClientId(),
      shipmentId: id,
      tempC: tempNum,
      humidity: humidity === '' ? null : Number(humidity),
      note: note.trim(),
      recordedAtIso: new Date().toISOString(),
    });
    navigate('/driver');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Log temperature</h1>
        <Link to="/driver" className="min-h-11 px-2 py-2 text-brand-link">Cancel</Link>
      </div>
      <label className="block">
        <span className="mb-1 block text-lg font-semibold">Temperature (°C)</span>
        <input className={big} inputMode="decimal" type="number" step="0.1" required value={temp} onChange={(e) => setTemp(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-lg font-semibold">Humidity (%) — optional</span>
        <input className={big} inputMode="decimal" type="number" step="1" min={0} max={100} value={humidity} onChange={(e) => setHumidity(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-lg font-semibold">Note — optional</span>
        <input className={big + ' text-lg'} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <Button type="submit" size="xl" className="w-full" disabled={!valid} loading={saving}>Save reading</Button>
    </form>
  );
}
