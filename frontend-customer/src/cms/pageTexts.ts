import { useCallback } from 'react';
import type React from 'react';
import { useI18n } from '../i18n';
import { useWebsiteStore } from '../store/cms/useWebsiteStore';

type Params = Record<string, string | number | null | undefined>;

const fill = (text: string, params?: Params) =>
  text.replace(/\{(\w+)\}/g, (whole, name) => (params?.[name] === undefined || params?.[name] === null ? whole : String(params[name])));

/**
 * Label lookup for one storefront area: the text saved in the Website Control Center
 * (pageTexts[page][language][key]) wins, otherwise the translation `${namespace}.${key}`.
 */
export function usePageText(page: string, namespace: string = page) {
  const { language, t } = useI18n();
  const texts = useWebsiteStore((state) => state.cms?.pageTexts?.[page]);
  return useCallback((key: string, params?: Params) => {
    const custom = texts?.[language]?.[key];
    if (typeof custom === 'string' && custom.trim() !== '') return fill(custom, params);
    return t(`${namespace}.${key}`, params as any);
  }, [texts, language, t, namespace]);
}

/**
 * Label of a header/menu link: its own text for this language, else the default text of its key
 * (built-in links), else its English text (links added by the shop).
 */
export function linkLabel(link: { key: string; label?: Record<string, string> }, language: string, fallback: (key: string) => string) {
  const own = link.label?.[language];
  if (typeof own === 'string' && own.trim()) return own;
  return fallback(link.key) || link.label?.en || '';
}

/** True inside the Website Control Center live preview. */
export const inEditorPreview = () =>
  typeof document !== 'undefined' && Boolean(document.querySelector('[data-nst-editor-preview="true"]'));

/** Tell the Website Control Center which global area was clicked in the preview. */
export const selectInEditor = (pageId: string, sectionId: string) => (event: React.MouseEvent) => {
  if (!inEditorPreview()) return;
  event.preventDefault();
  event.stopPropagation();
  window.parent?.postMessage({ type: 'NST_WEBSITE_SECTION_SELECTED', pageId, sectionId, sectionType: sectionId }, '*');
};
