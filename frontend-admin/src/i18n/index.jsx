import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/*
 * Translation files live in ./locales/<language>/<namespace>.json.
 * English is the master language; any key missing in another language falls back to English.
 * To add a language: create ./locales/<code>/ with the same file names and add it to LANGUAGES.
 */
const files = import.meta.glob('./locales/*/*.json', { eager: true });

export const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'nst_lang';

export const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr' },
  { code: 'bn', label: 'Bangla', nativeLabel: 'বাংলা', dir: 'ltr' },
  // { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl' },
  // { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', dir: 'ltr' },
  // { code: 'zh', label: 'Chinese', nativeLabel: '中文', dir: 'ltr' },
];

function flatten(source, prefix, target) {
  Object.entries(source || {}).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, target);
    else target[path] = String(value);
  });
  return target;
}

const dictionaries = {};
Object.entries(files).forEach(([path, mod]) => {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) return;
  const [, lang, namespace] = match;
  dictionaries[lang] = dictionaries[lang] || {};
  flatten(mod.default || mod, namespace, dictionaries[lang]);
});

const supported = (code) => LANGUAGES.some((item) => item.code === code);

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (supported(saved)) return saved;
  } catch { /* storage unavailable */ }
  return DEFAULT_LANGUAGE;
}

let currentLanguage = initialLanguage();

function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined || params[name] === null ? whole : String(params[name])));
}

/**
 * Translate a key. Works inside and outside React components.
 * t('sales.title') or t('sales.received', { amount: '৳500' })
 * Pass { defaultValue } to show a built-in text when the key does not exist.
 */
export function t(key, params, language = currentLanguage) {
  const text = dictionaries[language]?.[key] ?? dictionaries[DEFAULT_LANGUAGE]?.[key];
  if (text === undefined) {
    if (params?.defaultValue !== undefined) return interpolate(String(params.defaultValue), params);
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return interpolate(text, params);
}

export function hasTranslation(key, language = currentLanguage) {
  return dictionaries[language]?.[key] !== undefined;
}

export function getLanguage() {
  return currentLanguage;
}

function applyDocumentLanguage(code) {
  const meta = LANGUAGES.find((item) => item.code === code) || LANGUAGES[0];
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.dir;
}

const I18nContext = createContext({ language: currentLanguage, languages: LANGUAGES, setLanguage: () => {}, t });

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(currentLanguage);

  const setLanguage = useCallback((code) => {
    if (!supported(code)) return;
    currentLanguage = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage unavailable */ }
    applyDocumentLanguage(code);
    setLanguageState(code);
    window.dispatchEvent(new CustomEvent('nst-language-changed', { detail: code }));
  }, []);

  useEffect(() => { applyDocumentLanguage(language); }, [language]);

  const value = useMemo(() => ({
    language,
    languages: LANGUAGES,
    setLanguage,
    t: (key, params) => t(key, params, language),
  }), [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** Shortcut for components: const t = useT(); */
export function useT() {
  return useContext(I18nContext).t;
}

/** Stable key for a built-in label, e.g. labelKey('nav', "Today's Target") -> 'nav.todays_target'. */
export function labelKey(prefix, text) {
  return `${prefix}.${String(text || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
}
