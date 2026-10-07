import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Settings2 } from 'lucide-react';
import corporateOpsService from '../../../services/corporateOpsService';
import { NstButton, NstCard, NstCheckbox, NstInput, NstLoadingState, NstNotice, NstPageShell, NstTextarea } from '../../../components/ui';
import { getCorporateSettingsDomain, humanizeSettingKey } from './corporateSettingsRegistry';

const dataOf = (response) => response?.data?.data || response?.data || {};
const isSecret = (key) => /password|token|secret|api_key|credential/i.test(key);
const isLongText = (key, value) => /template|instructions|description|footer|terms|script/i.test(key) || String(value ?? '').length > 80;

function serializeValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function parseEditedValue(original, value) {
  if (typeof original === 'number' && value !== '') {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
  }
  if (original && typeof original === 'object') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function SettingField({ name, value, original, onChange }) {
  const label = humanizeSettingKey(name);
  if (typeof original === 'boolean') {
    return <NstCheckbox label={label} checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)}/>;
  }
  if (isLongText(name, value) || (original && typeof original === 'object')) {
    return <NstTextarea label={label} value={serializeValue(value)} onChange={(event) => onChange(parseEditedValue(original, event.target.value))} rows={6}/>;
  }
  return <NstInput label={label} type={isSecret(name) ? 'password' : typeof original === 'number' ? 'number' : 'text'} value={serializeValue(value)} onChange={(event) => onChange(parseEditedValue(original, event.target.value))}/>;
}

export default function CorporateSettingSectionPage() {
  const { sectionKey } = useParams();
  const domain = getCorporateSettingsDomain(sectionKey);
  const [form, setForm] = useState({});
  const [original, setOriginal] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const fieldNames = useMemo(() => domain?.fields || Object.keys(form), [domain, form]);

  useEffect(() => {
    if (!domain || domain.key === 'dashboard') return;
    let active = true;
    setLoading(true);
    setNotice(null);
    corporateOpsService.getSection(domain.sourceSection || domain.section)
      .then((response) => {
        if (!active) return;
        const data = dataOf(response) || {};
        setOriginal(data);
        setForm(data);
      })
      .catch((error) => {
        if (active) setNotice({ tone: 'danger', text: error?.response?.data?.message || 'Settings could not be loaded.' });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [domain?.key]);

  if (!domain) return <Navigate to="/settings/corporate" replace/>;
  if (domain.key === 'dashboard') return <Navigate to="/settings/corporate/dashboard" replace/>;

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const payload = domain.fields ? Object.fromEntries(domain.fields.map((key) => [key, form[key] ?? ''])) : form;
      const response = await corporateOpsService.saveSection(domain.section, payload);
      setNotice({ tone: 'success', text: response?.data?.message || `${domain.title} settings saved.` });
      setOriginal((current) => ({ ...current, ...payload }));
    } catch (error) {
      setNotice({ tone: 'danger', text: error?.response?.data?.message || `Could not save ${domain.title} settings.` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <NstPageShell
      icon={Settings2}
      eyebrow="Corporate Settings"
      title={domain.title}
      description={domain.description}
      maxWidth="1200px"
      actions={<NstButton as={Link} to="/settings/corporate" icon={ArrowLeft}>Settings Hub</NstButton>}
    >
      {notice ? <NstNotice tone={notice.tone}>{notice.text}</NstNotice> : null}
      {loading ? <NstLoadingState label={`Loading ${domain.title} settings…`}/> : (
        <NstCard
          title={`${domain.title} Configuration`}
          description="Changes are saved through the existing NST Corporate Settings API."
          actions={<NstButton variant="primary" icon={Save} loading={saving} onClick={save}>Save Changes</NstButton>}
        >
          {fieldNames.length ? <div className="grid gap-4 md:grid-cols-2">{fieldNames.map((key) => <SettingField key={key} name={key} value={form[key]} original={original[key]} onChange={(value) => set(key, value)}/>)}</div> : <NstNotice>No settings fields were returned for this section.</NstNotice>}
        </NstCard>
      )}
    </NstPageShell>
  );
}
