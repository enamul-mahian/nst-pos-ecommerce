import { Languages } from 'lucide-react';
import { useI18n } from './index';

export default function LanguageSwitcher({ className = '' }) {
  const { language, languages, setLanguage, t } = useI18n();
  if (languages.length < 2) return null;
  return (
    <label className={`nst-language-switcher ${className}`.trim()} title={t('common.language')}>
      <Languages size={16} aria-hidden="true"/>
      <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t('common.language')}>
        {languages.map((item) => <option key={item.code} value={item.code}>{item.nativeLabel}</option>)}
      </select>
    </label>
  );
}
