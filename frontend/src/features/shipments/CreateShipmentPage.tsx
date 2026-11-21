import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useCreateShipment, useDrivers, useVehicles } from '../../api/queries';
import { Button, Card, ErrorState, Field, LoadingState, PageHeader } from '../../components/ui';
import { inputClass } from '../../components/ui/styles';

export function CreateShipmentPage() {
  const navigate = useNavigate();
  const vehicles = useVehicles();
  const drivers = useDrivers();
  const create = useCreateShipment();
  const [form, setForm] = useState({
    product: '',
    batchNo: '',
    origin: 'Central Warehouse, Dhaka',
    destination: '',
    vehicleId: '',
    driverId: '',
    minTempC: '2',
    maxTempC: '8',
    eta: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const min = Number(form.minTempC);
  const max = Number(form.maxTempC);
  const rangeError = form.minTempC !== '' && form.maxTempC !== '' && min >= max ? 'Minimum must be lower than maximum' : null;

  if (vehicles.isPending || drivers.isPending) return <LoadingState />;
  if (vehicles.isError || drivers.isError)
    return <ErrorState message={errorMessage(vehicles.error ?? drivers.error)} onRetry={() => { void vehicles.refetch(); void drivers.refetch(); }} />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (rangeError) return;
    create.mutate(
      {
        product: form.product.trim(),
        batchNo: form.batchNo.trim(),
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        vehicleId: form.vehicleId,
        driverId: form.driverId,
        minTempC: min,
        maxTempC: max,
        etaIso: new Date(form.eta).toISOString(),
      },
      { onSuccess: (s) => navigate(`/shipments/${s.id}`) },
    );
  }

  const freeVehicles = vehicles.data.filter((v) => v.refrigerated && v.available);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Create shipment" subtitle="Assign a refrigerated vehicle, a driver and the temperature range to enforce." />
      <Card>
        <form onSubmit={onSubmit} className="space-y-6 p-6">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-[13px] font-semibold text-ink">Product</legend>
            <Field label="Product name"><input className={inputClass} required value={form.product} onChange={set('product')} placeholder="e.g. BCG Vaccine" /></Field>
            <Field label="Batch number"><input className={inputClass} required value={form.batchNo} onChange={set('batchNo')} placeholder="e.g. VAC-BCG-24018" /></Field>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-[13px] font-semibold text-ink">Route</legend>
            <Field label="Origin warehouse"><input className={inputClass} required value={form.origin} onChange={set('origin')} /></Field>
            <Field label="Destination clinic"><input className={inputClass} required value={form.destination} onChange={set('destination')} placeholder="e.g. Rural Health Clinic, Gazipur" /></Field>
            <Field label="Refrigerated vehicle" hint={`${freeVehicles.length} available`}>
              <select className={inputClass} required value={form.vehicleId} onChange={set('vehicleId')}>
                <option value="">Select…</option>
                {freeVehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
              </select>
            </Field>
            <Field label="Driver">
              <select className={inputClass} required value={form.driverId} onChange={set('driverId')}>
                <option value="">Select…</option>
                {drivers.data.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Target ETA"><input className={inputClass} type="datetime-local" required value={form.eta} onChange={set('eta')} /></Field>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-[13px] font-semibold text-ink">Temperature threshold</legend>
            <Field label="Minimum (°C)"><input className={inputClass} type="number" step="0.1" required value={form.minTempC} onChange={set('minTempC')} /></Field>
            <Field label="Maximum (°C)"><input className={inputClass} type="number" step="0.1" required value={form.maxTempC} onChange={set('maxTempC')} /></Field>
          </fieldset>
          {rangeError && <p role="alert" className="text-[13px] text-crit-text">{rangeError}</p>}
          {create.isError && <p role="alert" className="rounded-lg border border-crit-line bg-crit-bg p-3 text-[13px] text-crit-text">{errorMessage(create.error)}</p>}
          <div className="flex justify-end gap-2 border-t border-line-soft pt-5">
            <Button type="button" variant="secondary" onClick={() => navigate('/shipments')}>Cancel</Button>
            <Button type="submit" loading={create.isPending} disabled={!!rangeError}>Create shipment</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
