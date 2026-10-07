import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/*
 * Translation files live in ./locales/<language>/<namespace>.json.
 * English is the master language; any key missing in another language falls back to English.
 * To add a language: create ./locales/<code>/ with the same file names and add it to LANGUAGES.
 */
const files = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<string, { default?: unknown }>;

export type LanguageCode = string;
export interface LanguageMeta { code: LanguageCode; label: string; nativeLabel: string; dir: 'ltr' | 'rtl' }
type Params = Record<string, string | number | null | undefined> & { defaultValue?: string };

export const DEFAULT_LANGUAGE: LanguageCode = 'en';
const STORAGE_KEY = 'nst_lang';

export const LANGUAGES: LanguageMeta[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr' },
  { code: 'bn', label: 'Bangla', nativeLabel: 'বাংলা', dir: 'ltr' },
  // { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl' },
  // { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', dir: 'ltr' },
  // { code: 'zh', label: 'Chinese', nativeLabel: '中文', dir: 'ltr' },
];

function flatten(source: unknown, prefix: string, target: Record<string, string>) {
  Object.entries((source || {}) as Record<string, unknown>).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, target);
    else target[path] = String(value);
  });
  return target;
}

const dictionaries: Record<string, Record<string, string>> = {};
Object.entries(files).forEach(([path, mod]) => {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) return;
  const [, lang, namespace] = match;
  dictionaries[lang] = dictionaries[lang] || {};
  flatten(mod.default ?? mod, namespace, dictionaries[lang]);
});

const supported = (code: string | null) => LANGUAGES.some((item) => item.code === code);

function initialLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && supported(saved)) return saved;
  } catch { /* storage unavailable */ }
  return DEFAULT_LANGUAGE;
}

let currentLanguage = initialLanguage();

function interpolate(text: string, params?: Params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined || params[name] === null ? whole : String(params[name])));
}

/** Translate a key. Works inside and outside React components. */
export function t(key: string, params?: Params, language: LanguageCode = currentLanguage): string {
  const text = dictionaries[language]?.[key] ?? dictionaries[DEFAULT_LANGUAGE]?.[key];
  if (text === undefined) {
    if (params?.defaultValue !== undefined) return interpolate(String(params.defaultValue), params);
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return interpolate(text, params);
}

export function getLanguage() {
  return currentLanguage;
}

function applyDocumentLanguage(code: LanguageCode) {
  const meta = LANGUAGES.find((item) => item.code === code) || LANGUAGES[0];
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.dir;
}

interface I18nValue {
  language: LanguageCode;
  languages: LanguageMeta[];
  setLanguage: (code: LanguageCode) => void;
  t: (key: string, params?: Params) => string;
}

const I18nContext = createContext<I18nValue>({ language: currentLanguage, languages: LANGUAGES, setLanguage: () => {}, t });

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(currentLanguage);

  const setLanguage = useCallback((code: LanguageCode) => {
    if (!supported(code)) return;
    currentLanguage = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage unavailable */ }
    applyDocumentLanguage(code);
    setLanguageState(code);
  }, []);

  useEffect(() => { applyDocumentLanguage(language); }, [language]);

  const value = useMemo<I18nValue>(() => ({
    language,
    languages: LANGUAGES,
    setLanguage,
    t: (key, params) => t(key, params, language),
  }), [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n() {
  return useContext(I18nContext);
}

/** Shortcut for components: const t = useT(); */
export function useT() {
  return useContext(I18nContext).t;
}
