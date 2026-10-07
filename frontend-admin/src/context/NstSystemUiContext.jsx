import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import settingsService from '../services/settingsService';
import { useI18n } from '../i18n';
import { localizedPageText } from '../i18n/pageText';
import { applyFavicon, faviconSourceOf } from '../utils/favicon';

const CACHE_KEY = 'nst-system-ui-settings-v2';
const PUBLIC_CACHE_KEY = 'nst-system-ui-public-settings-v1';

const defaults = {
  ui_card_radius: 8,
  ui_card_gap: 14,
  ui_card_padding: 16,
  ui_section_gap: 18,
  ui_border_width: 1,
  scanner_enabled: true,
  scanner_auto_search: true,
  ui_page_content: {},
  ui_page_layout: {},
};

const Context = createContext({ settings: defaults, loading: false, refresh: async () => {}, save: async () => {} });

function safeParse(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function normalize(source = {}) {
  return {
    ...defaults,
    ...source,
    ui_page_content: safeParse(source.ui_page_content),
    ui_page_layout: safeParse(source.ui_page_layout),
  };
}

export function applyNstSystemUiSettings(source = {}) {
  const settings = normalize(source);
  const root = document.documentElement;
  const px = (key) => {
    const value = Number(settings[key]);
    return `${Number.isFinite(value) && settings[key] !== '' && settings[key] !== null ? value : defaults[key]}px`;
  };
  root.style.setProperty('--nst-custom-card-radius', px('ui_card_radius'));
  root.style.setProperty('--nst-custom-card-gap', px('ui_card_gap'));
  root.style.setProperty('--nst-custom-card-padding', px('ui_card_padding'));
  root.style.setProperty('--nst-custom-section-gap', px('ui_section_gap'));
  root.style.setProperty('--nst-custom-border-width', px('ui_border_width'));
  applyFavicon(faviconSourceOf(safeParse(settings.ui_brand)));
  window.dispatchEvent(new CustomEvent('nst-system-ui-applied', { detail: settings }));
  return settings;
}

function cacheKey(publicMode) {
  return publicMode ? PUBLIC_CACHE_KEY : CACHE_KEY;
}

function readCache(publicMode) {
  try { return normalize(JSON.parse(localStorage.getItem(cacheKey(publicMode)) || '{}')); } catch { return defaults; }
}

const sharedCache = { admin: null, public: null };
const sharedRequest = { admin: null, public: null };

async function loadShared(publicMode) {
  const mode = publicMode ? 'public' : 'admin';
  if (sharedCache[mode]) return sharedCache[mode];
  if (!sharedRequest[mode]) {
    const request = publicMode ? settingsService.getPublicSettings() : settingsService.getSettings();
    sharedRequest[mode] = request
      .then((response) => {
        sharedCache[mode] = normalize(response?.data || {});
        try { localStorage.setItem(cacheKey(publicMode), JSON.stringify(sharedCache[mode])); } catch {}
        return sharedCache[mode];
      })
      .finally(() => { sharedRequest[mode] = null; });
  }
  return sharedRequest[mode];
}

export function NstSystemUiProvider({ children, publicMode = false }) {
  const mode = publicMode ? 'public' : 'admin';
  const cached = useMemo(() => readCache(publicMode), [publicMode]);
  const [settings, setSettings] = useState(cached);
  const [loading, setLoading] = useState(!sharedCache[mode]);
  const [previewDraft, setPreviewDraft] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      sharedCache[mode] = null;
      const next = await loadShared(publicMode);
      setSettings(applyNstSystemUiSettings(next));
      return next;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSettings(cached);
    setLoading(!sharedCache[mode]);
    applyNstSystemUiSettings(cached);
    let active = true;
    loadShared(publicMode)
      .then((next) => { if (active) setSettings(applyNstSystemUiSettings(next)); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    const onRefresh = () => refresh().catch(() => {});
    window.addEventListener('nst-system-settings-refresh', onRefresh);
    return () => { active = false; window.removeEventListener('nst-system-settings-refresh', onRefresh); };
  }, [publicMode]);

  useEffect(() => {
    const previewMode = new URLSearchParams(window.location.search).get('nst_designer_preview') === '1';
    if (!previewMode || window.parent === window) return undefined;
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};
      if (data.type === 'NST_DESIGNER_APPLY' && data.pageKey) {
        setPreviewDraft({ pageKey: data.pageKey, content: data.content || {}, layout: data.layout || {} });
      }
      if (data.type === 'NST_DESIGNER_CLEAR_DRAFT') setPreviewDraft(null);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const effectiveSettings = useMemo(() => {
    if (!previewDraft?.pageKey) return settings;
    const key = previewDraft.pageKey;
    return {
      ...settings,
      ui_page_content: {
        ...(settings.ui_page_content || {}),
        [key]: { ...(settings.ui_page_content?.[key] || {}), ...(previewDraft.content || {}) },
      },
      ui_page_layout: {
        ...(settings.ui_page_layout || {}),
        [key]: { ...(settings.ui_page_layout?.[key] || {}), ...(previewDraft.layout || {}) },
      },
    };
  }, [settings, previewDraft]);

  const save = async (payload) => {
    if (publicMode) throw new Error('Public system UI provider is read-only.');
    const response = await settingsService.updateSettings(payload);
    const next = normalize(response?.data || payload);
    sharedCache.admin = next;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
    setSettings(applyNstSystemUiSettings(next));
    return response;
  };

  return <Context.Provider value={{ settings: effectiveSettings, loading, refresh, save }}>{children}</Context.Provider>;
}

export function useNstSystemUi() {
  return useContext(Context);
}

export function useNstPageContent(path, fallback = {}) {
  const { settings } = useNstSystemUi();
  const { language } = useI18n();
  const page = settings?.ui_page_content?.[path] || {};
  return {
    eyebrow: page.eyebrow ?? fallback.eyebrow ?? '',
    title: localizedPageText(page, 'title', language) || fallback.title || '',
    subtitle: localizedPageText(page, 'subtitle', language) || fallback.subtitle || '',
    extraFields: Array.isArray(page.extraFields) ? page.extraFields.filter((field) => field?.enabled !== false) : (fallback.extraFields || []),
  };
}

export function useNstPageLayout(path, fallback = {}) {
  const { settings } = useNstSystemUi();
  const page = settings?.ui_page_layout?.[path] || {};
  return {
    cardRadius: Number(page.cardRadius ?? fallback.cardRadius ?? settings.ui_card_radius ?? 8),
    cardGap: Number(page.cardGap ?? fallback.cardGap ?? settings.ui_card_gap ?? 14),
    cardPadding: Number(page.cardPadding ?? fallback.cardPadding ?? settings.ui_card_padding ?? 16),
    sectionGap: Number(page.sectionGap ?? fallback.sectionGap ?? settings.ui_section_gap ?? 18),
    borderWidth: Number(page.borderWidth ?? fallback.borderWidth ?? settings.ui_border_width ?? 1),
    pageMaxWidth: Number(page.pageMaxWidth ?? fallback.pageMaxWidth ?? 0),
    pagePaddingX: Number(page.pagePaddingX ?? fallback.pagePaddingX ?? 0),
    pagePaddingY: Number(page.pagePaddingY ?? fallback.pagePaddingY ?? 0),
    pageBackground: page.pageBackground ?? fallback.pageBackground ?? '',
    elements: Array.isArray(page.elements) ? page.elements : [],
    cards: page.cards && typeof page.cards === 'object' ? page.cards : {},
  };
}

export function useNstCardDesign(path, cardId, fallback = {}) {
  const page = useNstPageLayout(path);
  const card = page.cards?.[cardId] || {};
  const extras = Array.isArray(card.extraFields) ? card.extraFields.filter((item) => item?.enabled !== false) : (fallback.extraFields || []);
  return {
    ...fallback,
    ...card,
    title: card.title ?? fallback.title,
    subtitle: card.subtitle ?? fallback.subtitle,
    extraFields: extras,
    radius: Number(card.radius ?? page.cardRadius),
    padding: Number(card.padding ?? page.cardPadding),
    borderWidth: Number(card.borderWidth ?? page.borderWidth),
    minHeight: Number(card.minHeight ?? fallback.minHeight ?? 0),
    hoverLift: Number(card.hoverLift ?? fallback.hoverLift ?? 2),
  };
}
