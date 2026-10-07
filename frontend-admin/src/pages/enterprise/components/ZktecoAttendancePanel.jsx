import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Cable, RefreshCw, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';

const unwrap = (response) => response?.data?.data ?? response?.data ?? {};
const emptyDevice = {
  id: null, name: 'Office Attendance', model: 'SenseFace 2A', serial_number: '', protocol: 'ta_push',
  terminal_mode: 'attendance', direction_role: 'bidirectional', timezone: 'Asia/Dhaka', ip_address: '', port: '',
  three_factor_codes: '', card_codes: '', punch_in_codes: '', punch_out_codes: '', notes: '', is_active: true,
};

function Card({ title, description, action, children }) {
  return <section className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-[var(--nst-dashboard-text)]">{title}</h3>{description && <p className="mt-1 text-xs text-[var(--nst-dashboard-muted)]">{description}</p>}</div>{action}</div>
    {children}
  </section>;
}

function Field({ label, as = 'input', children, ...props }) {
  const cls = 'mt-1.5 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-3 py-2.5 text-sm text-[var(--nst-dashboard-text)] outline-none focus:border-[var(--nst-dashboard-primary)]';
  return <label className="text-[11px] font-black uppercase tracking-wide text-[var(--nst-dashboard-muted)]">{label}{as === 'select' ? <select {...props} className={cls}>{children}</select> : <input {...props} className={cls} />}</label>;
}

function TinyButton({ children, danger = false, ...props }) {
  return <button type="button" {...props} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black ${danger ? 'bg-red-500/10 text-red-600' : 'bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_12%,transparent)] text-[var(--nst-dashboard-primary)]'}`}>{children}</button>;
}

function GridTable({ rows = [], columns = [], empty = 'No records.' }) {
  if (!rows.length) return <div className="rounded-2xl border border-dashed border-[var(--nst-dashboard-border)] p-5 text-center text-sm text-[var(--nst-dashboard-muted)]">{empty}</div>;
  return <div className="overflow-x-auto rounded-2xl border border-[var(--nst-dashboard-border)]"><table className="min-w-full text-left text-xs"><thead className="bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_8%,transparent)]"><tr>{columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2.5 font-black uppercase text-[var(--nst-dashboard-muted)]">{c.label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--nst-dashboard-border)]">{rows.map((row, i) => <tr key={row.id ?? i}>{columns.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2.5 text-[var(--nst-dashboard-text)]">{c.render ? c.render(row) : (row[c.key] ?? '-')}</td>)}</tr>)}</tbody></table></div>;
}

export default function ZktecoAttendancePanel({ employees = [], dateRange }) {
  const [status, setStatus] = useState({});
  const [devices, setDevices] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [events, setEvents] = useState([]);
  const [movements, setMovements] = useState([]);
  const [report, setReport] = useState({ totals: {}, attendance: [] });
  const [deviceForm, setDeviceForm] = useState(emptyDevice);
  const [mappingForm, setMappingForm] = useState({ employee_id: '', device_id: '', device_user_id: '', card_number: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = { date_from: dateRange?.date_from, date_to: dateRange?.date_to };
    const [s, d, m, e, mv, rp] = await Promise.all([
      api.get('/hrm/zkteco/status'), api.get('/hrm/zkteco/devices'), api.get('/hrm/zkteco/mappings'),
      api.get('/hrm/zkteco/events', { params: { ...params, limit: 150 } }), api.get('/hrm/zkteco/movements', { params }), api.get('/hrm/zkteco/report', { params }),
    ]);
    setStatus(unwrap(s) || {}); setDevices(unwrap(d) || []); setMappings(unwrap(m) || []); setEvents(unwrap(e) || []); setMovements(unwrap(mv) || []); setReport(unwrap(rp) || { totals: {}, attendance: [] });
  }, [dateRange?.date_from, dateRange?.date_to]);

  useEffect(() => { load().catch((error) => toast.error(error?.response?.data?.message || 'ZKTeco data could not load.')); }, [load]);

  const saveDevice = async () => {
    if (!deviceForm.name.trim() || !deviceForm.serial_number.trim()) return toast.error('Device name and serial number are required.');
    setBusy(true);
    try {
      const payload = { ...deviceForm, port: deviceForm.port ? Number(deviceForm.port) : null };
      const response = deviceForm.id ? await api.put(`/hrm/zkteco/devices/${deviceForm.id}`, payload) : await api.post('/hrm/zkteco/devices', payload);
      const token = unwrap(response)?.device_token;
      if (token) window.prompt('Generic JSON receiver token (save only if needed):', token);
      setDeviceForm(emptyDevice); await load(); toast.success(deviceForm.id ? 'Device updated.' : 'Device registered.');
    } catch (error) { toast.error(error?.response?.data?.message || 'Device save failed.'); } finally { setBusy(false); }
  };

  const editDevice = (row) => {
    const vmap = row.verification_code_map || {};
    const pmap = row.punch_state_map || {};
    const codesWith = (factorSet) => Object.entries(vmap).filter(([, factors]) => factorSet.every((factor) => (Array.isArray(factors) ? factors : String(factors).split(/[,;+|]/)).includes(factor))).map(([code]) => code).join(',');
    setDeviceForm({
      ...emptyDevice, id: row.id, name: row.name || '', model: row.model || '', serial_number: row.serial_number || '', protocol: row.protocol || 'ta_push',
      terminal_mode: row.terminal_mode || 'attendance', direction_role: row.direction_role || 'bidirectional', timezone: row.timezone || 'Asia/Dhaka', ip_address: row.ip_address || '', port: row.port || '',
      three_factor_codes: codesWith(['card', 'fingerprint', 'face']), card_codes: codesWith(['card']),
      punch_in_codes: Object.entries(pmap).filter(([, v]) => v === 'in').map(([k]) => k).join(','), punch_out_codes: Object.entries(pmap).filter(([, v]) => v === 'out').map(([k]) => k).join(','),
      notes: row.notes || '', is_active: Boolean(row.is_active),
    });
  };

  const saveMapping = async () => {
    if (!mappingForm.employee_id || !mappingForm.device_id || !mappingForm.device_user_id.trim()) return toast.error('Employee, device and Device User ID are required.');
    setBusy(true);
    try {
      await api.post('/hrm/zkteco/mappings', { ...mappingForm, employee_id: Number(mappingForm.employee_id), device_id: Number(mappingForm.device_id) });
      setMappingForm({ employee_id: '', device_id: '', device_user_id: '', card_number: '' }); await load(); toast.success('Mapping saved and old unmatched events reprocessed.');
    } catch (error) { toast.error(error?.response?.data?.message || 'Mapping save failed.'); } finally { setBusy(false); }
  };

  const deleteMapping = async (row) => {
    if (!window.confirm(`Deactivate mapping for ${row.employee_name}?`)) return;
    await api.delete(`/hrm/zkteco/mappings/${row.id}`); await load();
  };

  const rebuild = async () => {
    setBusy(true); try { await api.post('/hrm/zkteco/rebuild', { date_from: dateRange?.date_from, date_to: dateRange?.date_to }); await load(); toast.success('Attendance rebuilt from raw events.'); } catch (error) { toast.error(error?.response?.data?.message || 'Rebuild failed.'); } finally { setBusy(false); }
  };

  const employeeOptions = useMemo(() => employees.map((e) => ({ id: e.id, label: `${e.employee_no || 'EMP'} · ${e.name}` })), [employees]);
  const fmt = (value) => value ? String(value).replace('T', ' ').slice(0, 19) : '-';

  return <div className="space-y-5">
    <Card title="ZKTeco Integration" description="Reusable device layer: raw immutable packets/events → employee mapping → 3-factor first attendance → reliable card movement. No biometric template is stored in NST OS." action={<TinyButton onClick={() => load()}><RefreshCw size={14}/>Refresh</TinyButton>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['Devices', status.devices_active ?? 0], ['Online', status.devices_online ?? 0], ['Mappings', status.employee_mappings ?? 0], ['Events Today', status.events_today ?? 0], ['3FA Today', status.three_factor_today ?? 0], ['Unmapped', status.unmapped_events ?? 0],
        ].map(([label, value]) => <div key={label} className="rounded-2xl bg-[var(--nst-dashboard-bg)] p-3"><p className="text-[10px] font-black uppercase text-[var(--nst-dashboard-muted)]">{label}</p><p className="mt-1 text-xl font-black text-[var(--nst-dashboard-text)]">{value}</p></div>)}
      </div>
      <div className="mt-4 rounded-2xl border border-[var(--nst-dashboard-border)] p-3 text-xs text-[var(--nst-dashboard-muted)]"><b className="text-[var(--nst-dashboard-text)]">ADMS/PUSH receiver:</b> {status.receiver_paths?.adms_root || '/iclock/cdata'} · First Present requires proven Card + Fingerprint + Face. Bidirectional devices require payload direction or configured Punch IN/OUT codes; the system never blindly alternates IN/OUT.</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['Period Records', report.totals?.records ?? 0], ['Present', report.totals?.present ?? 0], ['Temporary Exits', report.totals?.temporary_exits ?? 0], ['Outside Min', report.totals?.outside_minutes ?? 0], ['Inside Min', report.totals?.inside_minutes ?? 0], ['Late Min', report.totals?.late_minutes ?? 0],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--nst-dashboard-border)] p-3"><p className="text-[10px] font-black uppercase text-[var(--nst-dashboard-muted)]">{label}</p><p className="mt-1 text-lg font-black text-[var(--nst-dashboard-text)]">{value}</p></div>)}
      </div>
    </Card>

    <div className="grid gap-5 xl:grid-cols-2">
      <Card title={deviceForm.id ? 'Edit ZKTeco Device' : 'Register ZKTeco Device'} description="Serial number must match the physical device. Verification/punch codes are firmware-specific; leave blank until confirmed from real raw events.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Device Name" value={deviceForm.name} onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}/>
          <Field label="Model" value={deviceForm.model} onChange={(e) => setDeviceForm({ ...deviceForm, model: e.target.value })}/>
          <Field label="Serial Number" value={deviceForm.serial_number} onChange={(e) => setDeviceForm({ ...deviceForm, serial_number: e.target.value })}/>
          <Field label="Protocol" as="select" value={deviceForm.protocol} onChange={(e) => setDeviceForm({ ...deviceForm, protocol: e.target.value })}><option value="ta_push">TA PUSH / ADMS</option><option value="ac_push">AC PUSH</option><option value="push_sdk">PUSH SDK</option><option value="generic">Generic JSON Adapter</option></Field>
          <Field label="Device Role" as="select" value={deviceForm.direction_role} onChange={(e) => setDeviceForm({ ...deviceForm, direction_role: e.target.value })}><option value="entry">Entry = IN</option><option value="exit">Exit = OUT</option><option value="bidirectional">Bidirectional / requires direction</option></Field>
          <Field label="Terminal Mode" as="select" value={deviceForm.terminal_mode} onChange={(e) => setDeviceForm({ ...deviceForm, terminal_mode: e.target.value })}><option value="attendance">Attendance</option><option value="access_control">Access Control</option><option value="hybrid">Hybrid</option></Field>
          <Field label="3-Factor Verify Codes" placeholder="e.g. confirmed device code(s)" value={deviceForm.three_factor_codes} onChange={(e) => setDeviceForm({ ...deviceForm, three_factor_codes: e.target.value })}/>
          <Field label="Card Verify Codes" placeholder="confirmed card-only code(s)" value={deviceForm.card_codes} onChange={(e) => setDeviceForm({ ...deviceForm, card_codes: e.target.value })}/>
          <Field label="Punch IN Codes" placeholder="confirmed IN state code(s)" value={deviceForm.punch_in_codes} onChange={(e) => setDeviceForm({ ...deviceForm, punch_in_codes: e.target.value })}/>
          <Field label="Punch OUT Codes" placeholder="confirmed OUT state code(s)" value={deviceForm.punch_out_codes} onChange={(e) => setDeviceForm({ ...deviceForm, punch_out_codes: e.target.value })}/>
        </div>
        <div className="mt-4 flex gap-2"><button type="button" disabled={busy} onClick={saveDevice} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-2.5 text-sm font-black text-white"><Save size={15}/>{deviceForm.id ? 'Update Device' : 'Register Device'}</button>{deviceForm.id && <TinyButton onClick={() => setDeviceForm(emptyDevice)}>Cancel</TinyButton>}</div>
      </Card>

      <Card title="Employee ↔ Device Mapping" description="Maps NST Employee ID to the device User ID/Card. Face/fingerprint templates stay on the device.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employee" as="select" value={mappingForm.employee_id} onChange={(e) => setMappingForm({ ...mappingForm, employee_id: e.target.value })}><option value="">Select employee</option>{employeeOptions.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Field>
          <Field label="Device" as="select" value={mappingForm.device_id} onChange={(e) => setMappingForm({ ...mappingForm, device_id: e.target.value })}><option value="">Select device</option>{devices.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name} · {d.serial_number}</option>)}</Field>
          <Field label="Device User ID" value={mappingForm.device_user_id} onChange={(e) => setMappingForm({ ...mappingForm, device_user_id: e.target.value })}/>
          <Field label="RFID/Card Number" value={mappingForm.card_number} onChange={(e) => setMappingForm({ ...mappingForm, card_number: e.target.value })}/>
        </div>
        <div className="mt-4"><button type="button" disabled={busy} onClick={saveMapping} className="inline-flex items-center gap-2 rounded-xl bg-[var(--nst-dashboard-primary)] px-4 py-2.5 text-sm font-black text-white"><Users size={15}/>Save Mapping</button></div>
      </Card>
    </div>

    <Card title="Registered Devices">
      <GridTable rows={devices} columns={[
        { key: 'name', label: 'Device' }, { key: 'model', label: 'Model' }, { key: 'serial_number', label: 'Serial' }, { key: 'direction_role', label: 'Role' },
        { key: 'last_seen_at', label: 'Last Seen', render: (r) => fmt(r.last_seen_at) }, { key: 'is_active', label: 'State', render: (r) => r.is_active ? 'Active' : 'Inactive' },
        { key: 'action', label: 'Action', render: (r) => <TinyButton onClick={() => editDevice(r)}><Cable size={13}/>Edit</TinyButton> },
      ]}/>
    </Card>

    <Card title="Employee Device Mappings">
      <GridTable rows={mappings} columns={[
        { key: 'employee_no', label: 'Employee No' }, { key: 'employee_name', label: 'Employee' }, { key: 'device_name', label: 'Device' }, { key: 'device_user_id', label: 'Device User' }, { key: 'card_number', label: 'Card' },
        { key: 'action', label: 'Action', render: (r) => <TinyButton danger onClick={() => deleteMapping(r)}><Trash2 size={13}/>Deactivate</TinyButton> },
      ]}/>
    </Card>

    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Recent Raw-Normalized Events" description="Unknown firmware codes remain visible instead of being guessed." action={<TinyButton onClick={rebuild}><ShieldCheck size={14}/>Rebuild Period</TinyButton>}>
        <GridTable rows={events.slice(0, 100)} columns={[
          { key: 'event_time', label: 'Time', render: (r) => fmt(r.event_time) }, { key: 'employee_name', label: 'Employee' }, { key: 'device_user_id', label: 'User ID' },
          { key: 'verification_code', label: 'Verify Code' }, { key: 'punch_state', label: 'Punch' }, { key: 'direction', label: 'Dir' }, { key: 'three_factor_verified', label: '3FA', render: (r) => r.three_factor_verified ? 'YES' : '-' }, { key: 'processing_status', label: 'Status' },
        ]}/>
      </Card>
      <Card title="Movement History" description="Temporary OUT→IN pairs are counted; an unpaired OUT is kept as open/final exit instead of creating a fake return.">
        <GridTable rows={movements.slice(0, 150)} columns={[
          { key: 'movement_date', label: 'Date' }, { key: 'employee_name', label: 'Employee' }, { key: 'out_time', label: 'OUT', render: (r) => fmt(r.out_time) }, { key: 'in_time', label: 'IN', render: (r) => fmt(r.in_time) }, { key: 'outside_duration_minutes', label: 'Outside (min)' }, { key: 'status', label: 'State' },
        ]}/>
      </Card>
    </div>
  </div>;
}
