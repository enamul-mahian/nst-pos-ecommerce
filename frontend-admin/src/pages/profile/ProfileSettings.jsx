import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import profileService from '../../services/profileService';
import { useAuth } from '../../context/AuthContext';
import { Camera, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { NstPageHeader } from '../../components/ui/nst-page-header';


const PROFILE_CACHE_KEY = 'nst-auth-profile-cache:v1';
function readPersistentProfileCache(){ try { return JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || 'null'); } catch { return null; } }
function writePersistentProfileCache(value){ try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(value || {})); } catch {} }
let sharedProfileCache = readPersistentProfileCache();
let sharedProfileRequest = null;

async function fetchSharedProfile({ force = false } = {}) {
  if (!force && sharedProfileCache) return sharedProfileCache;
  if (!sharedProfileRequest) {
    sharedProfileRequest = profileService.get()
      .then((response) => {
        sharedProfileCache = response?.data?.data || response?.data || {};
        writePersistentProfileCache(sharedProfileCache);
        return sharedProfileCache;
      })
      .finally(() => { sharedProfileRequest = null; });
  }
  return sharedProfileRequest;
}

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  username: '',
  address: '',
  current_password: '',
  password: '',
  password_confirmation: '',
};

function profileFormFrom(user = {}) {
  return {
    ...emptyForm,
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    username: user.username || '',
    address: user.address || '',
  };
}

export default function ProfileSettings() {
  const { user: authEnvelope, updateUserProfile } = useAuth();
  const cachedProfile = useMemo(() => authEnvelope?.user || authEnvelope || sharedProfileCache || {}, [authEnvelope]);
  const hasCachedProfile = Boolean(cachedProfile?.id || cachedProfile?.email || cachedProfile?.name);
  const [tab, setTab] = useState('profile');
  const [form, setForm] = useState(() => profileFormFrom(cachedProfile));
  const [profilePhoto, setProfilePhoto] = useState(null);
  const previewObjectUrlRef = useRef('');
  const [preview, setPreview] = useState(() => cachedProfile.profile_photo_url || '');
  const [loading, setLoading] = useState(!hasCachedProfile);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  const loadProfile = async ({ blocking = false, force = false } = {}) => {
    try {
      if (blocking) setLoading(true);
      else setRefreshing(true);
      setError('');
      const user = await fetchSharedProfile({ force });
      if (!mountedRef.current) return;
      setForm(profileFormFrom(user));
      setPreview(user.profile_photo_url || '');
      updateUserProfile(user);
    } catch (err) {
      if (mountedRef.current) setError(err?.response?.data?.message || 'Profile could not be loaded.');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadProfile({ blocking: !hasCachedProfile });
    return () => { mountedRef.current = false; if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current); };
  }, []);

  const setField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && value !== undefined) payload.append(key, value);
      });
      if (profilePhoto) payload.append('profile_photo', profilePhoto);
      const response = await profileService.update(payload);
      const updated = response?.data?.data || {};
      sharedProfileCache = { ...(sharedProfileCache || {}), ...updated };
      writePersistentProfileCache(sharedProfileCache);
      updateUserProfile(sharedProfileCache);
      setPreview(sharedProfileCache.profile_photo_url || preview);
      setMessage('Profile updated successfully. The topbar photo has been refreshed.');
      setForm((previous) => ({ ...previous, ...profileFormFrom(sharedProfileCache), current_password: '', password: '', password_confirmation: '' }));
      setProfilePhoto(null);
    } catch (err) {
      const errors = err?.response?.data?.errors;
      const firstError = errors ? Object.values(errors).flat()[0] : null;
      setError(firstError || err?.response?.data?.message || 'Profile could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ProfileSettingsSkeleton/>;

  return (
    <div className="p-4 md:p-6">
      {refreshing && <div className="nst-profile-refresh-indicator" role="status"><span/>Refreshing profile…</div>}
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 md:p-7">
          <NstPageHeader icon={UserRound} title={<>Profile & Security</>} subtitle={<>Manage profile information, photo persistence and Google Authenticator.</>}/>
          <div className="mt-5 flex flex-wrap gap-2">
            <Tab active={tab === 'profile'} onClick={() => setTab('profile')}><UserRound size={16}/>Profile</Tab>
            <Tab active={tab === 'two-factor'} onClick={() => setTab('two-factor')}><ShieldCheck size={16}/>Google Authenticator</Tab>
          </div>
        </div>

        <div className="p-5 md:p-7">
          {message && <Notice type="success">{message}</Notice>}
          {error && <Notice type="error">{error}</Notice>}
          {tab === 'profile' ? (
            <ProfileForm
              form={form}
              setField={setField}
              preview={preview}
              setPreview={setPreview}
              setProfilePhoto={(file) => {
                setProfilePhoto(file);
                if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
                previewObjectUrlRef.current = file ? URL.createObjectURL(file) : '';
                if (previewObjectUrlRef.current) setPreview(previewObjectUrlRef.current);
              }}
              saving={saving}
              submit={submit}
            />
          ) : (
            <TwoFactorPanel onMessage={setMessage} onError={setError} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileForm({ form, setField, preview, setPreview, setProfilePhoto, saving, submit }) {
  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Name" value={form.name} onChange={(value) => setField('name', value)} required />
        <Input label="Email" type="email" value={form.email} onChange={(value) => setField('email', value)} required />
        <Input label="Phone" value={form.phone} onChange={(value) => setField('phone', value)} />
        <Input label="Username" value={form.username} onChange={(value) => setField('username', value)} />
      </div>

      <label className="block text-sm font-bold text-slate-700">
        Address
        <textarea value={form.address} onChange={(event) => setField('address', event.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]" />
      </label>

      <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-[1fr_auto] md:items-center">
        <label className="block text-sm font-bold text-slate-700">
          <span className="inline-flex items-center gap-2"><Camera size={16}/>Profile Photo</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            const file = event.target.files?.[0] || null;
            setProfilePhoto(file);
          }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3" />
          <span className="mt-2 block text-xs font-normal text-slate-500">JPG, PNG or WebP, maximum 5 MB. The photo persists after refresh and login.</span>
        </label>
        {preview ? <img src={preview} alt="Profile" className="h-32 w-32 rounded-3xl border border-white object-cover shadow" onError={() => setPreview('')} /> : <div className="flex h-32 w-32 items-center justify-center rounded-3xl bg-white text-sm text-slate-400">No Photo</div>}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <h2 className="inline-flex items-center gap-2 font-black text-slate-900"><KeyRound size={18}/>Change Password</h2>
        <p className="text-sm text-slate-500">Leave these fields blank to keep the current password.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Input label="Current Password" type="password" value={form.current_password} onChange={(value) => setField('current_password', value)} />
          <Input label="New Password" type="password" value={form.password} onChange={(value) => setField('password', value)} />
          <Input label="Confirm Password" type="password" value={form.password_confirmation} onChange={(value) => setField('password_confirmation', value)} />
        </div>
      </div>

      <div className="flex justify-end">
        <button disabled={saving} type="submit" className="rounded-xl bg-[var(--nst-dashboard-primary)] px-6 py-3 text-sm font-black text-white hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60">
          {saving ? 'Saving...' : 'Update Profile'}
        </button>
      </div>
    </form>
  );
}

function ProfileSettingsSkeleton() {
  return <div className="p-4 md:p-6" role="status" aria-label="Loading profile">
    <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] shadow-[var(--nst-dashboard-shadow)]">
      <div className="animate-pulse border-b border-[var(--nst-dashboard-border)] p-5 md:p-7">
        <div className="flex items-center gap-3"><div className="h-12 w-12 rounded-2xl bg-slate-200"/><div className="space-y-2"><div className="h-7 w-56 rounded-xl bg-slate-200"/><div className="h-4 w-80 max-w-full rounded-lg bg-slate-100"/></div></div>
        <div className="mt-5 flex gap-2"><div className="h-10 w-28 rounded-xl bg-slate-100"/><div className="h-10 w-48 rounded-xl bg-slate-100"/></div>
      </div>
      <div className="animate-pulse space-y-5 p-5 md:p-7">
        <div className="grid gap-4 md:grid-cols-2">{[0,1,2,3].map((item)=><div key={item} className="h-14 rounded-xl bg-slate-100"/>)}</div>
        <div className="h-28 rounded-2xl bg-slate-100"/>
        <div className="h-40 rounded-2xl bg-slate-100"/>
        <div className="h-44 rounded-2xl bg-slate-100"/>
      </div>
    </div>
  </div>;
}

function TwoFactorPanel({ onMessage, onError }) {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const response = await profileService.twoFactorStatus();
      setStatus(response?.data?.data || {});
    } catch (err) {
      onError(err?.response?.data?.message || 'Two-factor status could not be loaded.');
    }
  };

  useEffect(() => { load(); }, []);

  const startSetup = async () => {
    try {
      setBusy(true); onError(''); onMessage(''); setRecoveryCodes([]);
      const response = await profileService.setupTwoFactor();
      const data = response?.data?.data || {};
      setSetup(data);
      setQr(await QRCode.toDataURL(data.provisioning_uri, { width: 240, margin: 2 }));
    } catch (err) {
      onError(err?.response?.data?.message || 'Two-factor setup could not be started.');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    try {
      setBusy(true); onError('');
      const response = await profileService.confirmTwoFactor(code);
      setRecoveryCodes(response?.data?.data?.recovery_codes || []);
      setSetup(null); setQr(''); setCode('');
      onMessage('Google Authenticator enabled. Store the recovery codes securely.');
      await load();
    } catch (err) {
      onError(err?.response?.data?.message || 'Authenticator code is invalid.');
    } finally { setBusy(false); }
  };

  const disable = async () => {
    try {
      setBusy(true); onError('');
      await profileService.disableTwoFactor(password, code);
      setPassword(''); setCode(''); setRecoveryCodes([]);
      onMessage('Two-factor authentication disabled.');
      await load();
    } catch (err) {
      onError(err?.response?.data?.message || 'Two-factor authentication could not be disabled.');
    } finally { setBusy(false); }
  };

  const regenerate = async () => {
    try {
      setBusy(true); onError('');
      const response = await profileService.regenerateRecoveryCodes(password, code);
      setRecoveryCodes(response?.data?.data?.recovery_codes || []);
      setPassword(''); setCode('');
      onMessage('New recovery codes generated. Previous recovery codes are invalid.');
      await load();
    } catch (err) {
      onError(err?.response?.data?.message || 'Recovery codes could not be generated.');
    } finally { setBusy(false); }
  };

  if (!status) return <p className="text-sm text-slate-500">Loading security status...</p>;

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 ${status.enabled ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">2FA Status</p>
        <h2 className="mt-1 text-xl font-black text-slate-900">{status.enabled ? 'Enabled' : 'Disabled'}</h2>
        <p className="mt-1 text-sm text-slate-600">Recovery codes remaining: {status.recovery_codes_remaining || 0}</p>
      </div>

      {!status.enabled && !setup && (
        <button disabled={busy} onClick={startSetup} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-60">Set Up Google Authenticator</button>
      )}

      {setup && (
        <div className="grid gap-5 rounded-2xl border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] p-5 md:grid-cols-[auto_1fr]">
          {qr && <img src={qr} alt="Google Authenticator QR code" className="h-60 w-60 rounded-2xl border border-slate-100" />}
          <div>
            <h3 className="font-black text-slate-900">Scan and confirm</h3>
            <p className="mt-1 text-sm text-slate-500">Scan this QR code in Google Authenticator, or enter the secret manually.</p>
            <code className="mt-3 block break-all rounded-xl bg-slate-950 p-3 text-xs text-white">{setup.secret}</code>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" maxLength={6} placeholder="6-digit code" className="rounded-xl border border-slate-200 px-4 py-3" />
              <button disabled={busy || code.length !== 6} onClick={confirm} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white disabled:opacity-60">Confirm & Enable</button>
            </div>
          </div>
        </div>
      )}

      {status.enabled && (
        <div className="grid gap-5 md:grid-cols-2">
          <SecurityAction title="Generate New Recovery Codes" description="This invalidates all previous recovery codes.">
            <Input label="Current Password" type="password" value={password} onChange={setPassword} />
            <Input label="Authenticator Code" value={code} onChange={setCode} />
            <button disabled={busy} onClick={regenerate} className="rounded-xl border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] px-4 py-2.5 text-sm font-black text-[var(--nst-dashboard-primary)]">Generate Codes</button>
          </SecurityAction>
          <SecurityAction title="Disable 2FA" description="A password and current authenticator code are required.">
            <Input label="Current Password" type="password" value={password} onChange={setPassword} />
            <Input label="Authenticator Code" value={code} onChange={setCode} />
            <button disabled={busy} onClick={disable} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white">Disable 2FA</button>
          </SecurityAction>
        </div>
      )}

      {recoveryCodes.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-black text-amber-900">Recovery Codes</h3>
          <p className="text-sm text-amber-800">Each code can be used once. Save them now.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {recoveryCodes.map((item) => <code key={item} className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-800">{item}</code>)}
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityAction({ title, description, children }) {
  return <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-5"><h3 className="font-black text-slate-900">{title}</h3><p className="text-sm text-slate-500">{description}</p>{children}</div>;
}

function Tab({ active, onClick, children }) {
  return <button type="button" onClick={onClick} className={`rounded-xl px-4 py-2 text-sm font-black ${active ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'bg-slate-100 text-slate-600'}`}>{children}</button>;
}

function Notice({ type, children }) {
  return <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{children}</div>;
}

function Input({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      {label}
      <input type={type} required={required} value={value || ''} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]" />
    </label>
  );
}
