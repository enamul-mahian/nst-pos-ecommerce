import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, LayoutDashboard, Save } from 'lucide-react';
import api from '../../../services/api';
import { NstButton, NstCard, NstCheckbox, NstInput, NstLoadingState, NstNotice, NstPageShell, NstSelect } from '../../../components/ui';

const widgetOptions = [
  ['today_sales','Today Sales'], ['today_collection','Today Collection'], ['today_due','Today Due'],
  ['today_expense','Today Expense'], ['net_profit','Net Profit'], ['website_orders','Website Orders'],
  ['low_stock','Low Stock'], ['pending_warranty','Pending Warranty'], ['pending_booking','Pending Booking'],
  ['open_messages','Open Messages'], ['recent_activities','Recent Activities'], ['central_search','Central Search'],
];
const dataOf = (response) => response?.data?.data || response?.data || {};

export default function DashboardAccessSettingsPage() {
  const [options, setOptions] = useState({ roles: [], users: [], branches: [] });
  const [profiles, setProfiles] = useState([]);
  const [subjectType, setSubjectType] = useState('role');
  const [subjectId, setSubjectId] = useState('');
  const [widgets, setWidgets] = useState(widgetOptions.map(([key]) => key));
  const [scope, setScope] = useState('own_branch');
  const [branches, setBranches] = useState([]);
  const [expires, setExpires] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const targets = useMemo(() => subjectType === 'role' ? options.roles || [] : options.users || [], [options, subjectType]);

  const load = async () => {
    setLoading(true);
    try {
      const [optionsResponse, profilesResponse] = await Promise.all([
        api.get('/dashboard-access/options'),
        api.get('/dashboard-access/profiles'),
      ]);
      setOptions(dataOf(optionsResponse) || { roles: [], users: [], branches: [] });
      setProfiles(dataOf(profilesResponse) || []);
    } catch (error) {
      setNotice({ tone: 'danger', text: error?.response?.data?.message || 'Dashboard access settings could not be loaded.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleWidget = (key) => setWidgets((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const moveWidget = (key, direction) => setWidgets((current) => {
    const next = [...current];
    const from = next.indexOf(key);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= next.length) return next;
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
  const editProfile = (profile) => {
    setSubjectType(profile.subject_type);
    setSubjectId(String(profile.subject_id));
    setWidgets(profile.widget_order?.length ? profile.widget_order : profile.widgets || []);
    setScope(profile.data_scope || 'own_branch');
    setBranches(profile.selected_branches || []);
    setExpires(profile.expires_at ? String(profile.expires_at).slice(0, 16) : '');
    setNotice(null);
  };
  const save = async () => {
    if (!subjectId) {
      setNotice({ tone: 'warning', text: 'Select a role or user before saving dashboard access.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await api.post('/dashboard-access/profiles', {
        subject_type: subjectType,
        subject_id: Number(subjectId),
        widgets,
        widget_order: widgets,
        data_scope: scope,
        selected_branches: branches,
        expires_at: expires || null,
      });
      setNotice({ tone: 'success', text: 'Dashboard visibility saved. It applies on the next refresh or login.' });
      await load();
    } catch (error) {
      setNotice({ tone: 'danger', text: error?.response?.data?.message || 'Dashboard access could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <NstPageShell
      icon={LayoutDashboard}
      eyebrow="Corporate Settings"
      title="Dashboard Access"
      description="Manage widget visibility, order and data scope by role or individual user. Dashboard layout customization remains on the Dashboard itself."
      maxWidth="1450px"
      actions={<NstButton as={Link} to="/settings/corporate" icon={ArrowLeft}>Settings Hub</NstButton>}
    >
      {notice ? <NstNotice tone={notice.tone}>{notice.text}</NstNotice> : null}
      {loading ? <NstLoadingState label="Loading Dashboard access settings…"/> : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,.8fr)]">
          <NstCard title="Visibility & Order" description="Choose which widgets the selected role/user can see and their default order." actions={<NstButton variant="primary" icon={Save} loading={saving} onClick={save}>Save Access</NstButton>}>
            <div className="grid gap-4 md:grid-cols-2">
              <NstSelect label="Subject Type" value={subjectType} onChange={(event) => { setSubjectType(event.target.value); setSubjectId(''); }}><option value="role">Role Default</option><option value="user">Specific User Override</option></NstSelect>
              <NstSelect label={subjectType === 'role' ? 'Role' : 'User'} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Select {subjectType}</option>{targets.map((item) => <option key={item.id} value={item.id}>{item.name}{item.email ? ` — ${item.email}` : ''}</option>)}</NstSelect>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {widgetOptions.map(([key, label]) => {
                const visible = widgets.includes(key);
                return <div key={key} className={`flex items-center gap-2 rounded-xl border p-2 ${visible ? 'border-[var(--nst-dashboard-primary)] bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_7%,var(--nst-dashboard-surface))]' : 'border-[var(--nst-dashboard-border)]'}`}><div className="min-w-0 flex-1"><NstCheckbox label={label} checked={visible} onChange={() => toggleWidget(key)} className="border-0 bg-transparent px-2 py-2"/></div><button type="button" aria-label={`Move ${label} up`} onClick={() => moveWidget(key, -1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--nst-dashboard-border)]"><ArrowUp size={15}/></button><button type="button" aria-label={`Move ${label} down`} onClick={() => moveWidget(key, 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--nst-dashboard-border)]"><ArrowDown size={15}/></button></div>;
              })}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <NstSelect label="Data Scope" value={scope} onChange={(event) => setScope(event.target.value)}><option value="own_branch">Own Branch</option><option value="selected_branches">Selected Branches</option><option value="all_branches">All Branches</option><option value="all_records">All Records</option></NstSelect>
              <NstInput label="Expires At" type="datetime-local" value={expires} onChange={(event) => setExpires(event.target.value)}/>
            </div>

            {scope === 'selected_branches' ? <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(options.branches || []).map((branch) => <NstCheckbox key={branch.id} label={branch.name} checked={branches.includes(branch.id)} onChange={(event) => setBranches((current) => event.target.checked ? [...current, branch.id] : current.filter((id) => id !== branch.id))}/>)}</div> : null}
          </NstCard>

          <NstCard title="Saved Profiles" description="Open an existing profile to edit it.">
            <div className="space-y-2">{profiles.length ? profiles.map((profile) => <button type="button" key={profile.id} onClick={() => editProfile(profile)} className="w-full rounded-xl border border-[var(--nst-dashboard-border)] p-3 text-left transition hover:border-[var(--nst-dashboard-primary)]"><strong className="block text-sm">{profile.subject_name}</strong><span className="mt-1 block text-xs text-[var(--nst-dashboard-muted)]">{profile.subject_type} · {profile.widgets?.length || 0} widgets · {profile.data_scope}</span></button>) : <p className="rounded-xl border border-dashed border-[var(--nst-dashboard-border)] p-4 text-sm text-[var(--nst-dashboard-muted)]">No saved dashboard access profiles.</p>}</div>
          </NstCard>
        </div>
      )}
    </NstPageShell>
  );
}
