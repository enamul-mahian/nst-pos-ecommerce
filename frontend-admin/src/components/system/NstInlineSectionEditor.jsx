import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Paintbrush, RotateCcw, Save, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useNstSystemUi } from '../../context/NstSystemUiContext';

const CANDIDATE_SELECTOR = [
  'main section',
  'main article',
  'main .nst-panel',
  'main .nst-card',
  'main .nst-report-editable-card',
  'main [class*="rounded-"][class*="border"]',
].join(',');

function cleanKey(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54) || 'section';
}

function defaults() {
  return { transparent: false, background: '', borderColor: '', borderWidth: '', radius: '', padding: '', shadow: 'keep' };
}

function applyStyle(element, style = {}) {
  if (!element) return;
  element.style.setProperty('background', style.transparent ? 'transparent' : (style.background || ''), style.transparent || style.background ? 'important' : '');
  element.style.setProperty('background-color', style.transparent ? 'transparent' : (style.background || ''), style.transparent || style.background ? 'important' : '');
  element.style.setProperty('border-color', style.borderColor || '', style.borderColor ? 'important' : '');
  element.style.setProperty('border-width', style.borderWidth === '' ? '' : `${Number(style.borderWidth)}px`, style.borderWidth === '' ? '' : 'important');
  element.style.setProperty('border-style', style.borderWidth === '' ? '' : 'solid', style.borderWidth === '' ? '' : 'important');
  element.style.setProperty('border-radius', style.radius === '' ? '' : `${Number(style.radius)}px`, style.radius === '' ? '' : 'important');
  element.style.setProperty('padding', style.padding === '' ? '' : `${Number(style.padding)}px`, style.padding === '' ? '' : 'important');
  if (style.shadow === 'none') element.style.setProperty('box-shadow', 'none', 'important');
  else if (style.shadow === 'soft') element.style.setProperty('box-shadow', '0 10px 28px rgba(0,0,0,.16)', 'important');
  else element.style.removeProperty('box-shadow');
}

function isCandidate(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest('.nst-inline-editor-modal,.nst-inline-edit-button,.nst-sidebar,.nst-topbar')) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 260 || rect.height < 88) return false;
  if (['TABLE','TBODY','THEAD','TR','FORM','NAV','HEADER','MAIN'].includes(element.tagName)) return false;
  return true;
}

export default function NstInlineSectionEditor({ enabled = false }) {
  const location = useLocation();
  const { settings, save } = useNstSystemUi();
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(defaults);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const pathKey = location.pathname;
  // Edit chips only appear in design mode, so they never cover a card's own buttons during normal work.
  const [designMode, setDesignMode] = useState(() => { try { return localStorage.getItem('nst_design_mode') === '1'; } catch { return false; } });
  useEffect(() => {
    document.body.classList.toggle('nst-design-mode', enabled && designMode);
    try { localStorage.setItem('nst_design_mode', designMode ? '1' : '0'); } catch { /* storage unavailable */ }
    return () => document.body.classList.remove('nst-design-mode');
  }, [enabled, designMode]);
  const stored = useMemo(() => settings?.ui_page_layout?.[pathKey]?.inlineSections || {}, [settings, pathKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer;
    const scan = () => {
      document.querySelectorAll('.nst-inline-edit-button').forEach((node) => node.remove());
      const seen = new Map();
      [...document.querySelectorAll(CANDIDATE_SELECTOR)].filter(isCandidate).forEach((element) => {
        if (element.dataset.nstInlineEditorSkip === '1') return;
        const heading = element.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > div > h1,:scope > div > h2,:scope > div > h3');
        const base = cleanKey(heading?.textContent || element.getAttribute('aria-label') || element.className || element.tagName);
        const count = (seen.get(base) || 0) + 1;
        seen.set(base, count);
        const key = `${base}-${count}`;
        element.dataset.nstInlineSectionKey = key;
        element.classList.add('nst-inline-editable-section');
        applyStyle(element, stored[key]);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'nst-inline-edit-button';
        button.setAttribute('aria-label', 'Edit section design');
        button.title = 'Edit this section';
        button.innerHTML = '<span aria-hidden="true">✎</span><b>Edit</b>';
        button.addEventListener('click', (event) => {
          event.preventDefault(); event.stopPropagation();
          setSelected({ key, element, title: heading?.textContent?.trim() || 'Section / Card' });
          setDraft({ ...defaults(), ...(stored[key] || {}) });
          setMessage('');
        });
        element.appendChild(button);
      });
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 120); };
    schedule();
    const observer = new MutationObserver((mutations) => {
      const meaningful = mutations.some((mutation) => {
        const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
        return nodes.some((node) => !(node instanceof HTMLElement) || !node.classList.contains('nst-inline-edit-button'));
      });
      if (meaningful) schedule();
    });
    const main = document.querySelector('main.nst-shell-main');
    if (main) observer.observe(main, { childList: true, subtree: true });
    window.addEventListener('nst-system-ui-applied', schedule);
    return () => {
      clearTimeout(timer); observer.disconnect(); window.removeEventListener('nst-system-ui-applied', schedule);
      document.querySelectorAll('.nst-inline-edit-button').forEach((node) => node.remove());
      document.querySelectorAll('.nst-inline-editable-section').forEach((node) => node.classList.remove('nst-inline-editable-section'));
    };
  }, [enabled, pathKey, stored]);

  useEffect(() => { if (selected?.element) applyStyle(selected.element, draft); }, [draft, selected]);

  const toggle = enabled ? createPortal(
    <button type="button" className={`nst-design-mode-toggle ${designMode ? 'is-on' : ''}`} onClick={() => setDesignMode((value) => !value)} aria-pressed={designMode} title="Show or hide the Edit buttons on cards and sections">
      <Paintbrush size={14} />{designMode ? 'Design mode on' : 'Design'}
    </button>, document.body) : null;

  if (!enabled) return null;
  if (!selected) return toggle;

  const close = () => { applyStyle(selected.element, stored[selected.key] || {}); setSelected(null); };
  const persist = async () => {
    try {
      setSaving(true); setMessage('');
      const allLayout = settings?.ui_page_layout && typeof settings.ui_page_layout === 'object' ? settings.ui_page_layout : {};
      const page = allLayout[pathKey] && typeof allLayout[pathKey] === 'object' ? allLayout[pathKey] : {};
      const inlineSections = page.inlineSections && typeof page.inlineSections === 'object' ? page.inlineSections : {};
      await save({ ...settings, ui_page_layout: { ...allLayout, [pathKey]: { ...page, inlineSections: { ...inlineSections, [selected.key]: draft } } } });
      setMessage('Saved. This section now uses the shared live design setting.');
      setTimeout(() => setSelected(null), 450);
    } catch (error) { setMessage(error?.response?.data?.message || 'Could not save section design.'); }
    finally { setSaving(false); }
  };
  const reset = async () => {
    const next = defaults(); setDraft(next);
    try {
      setSaving(true);
      const allLayout = settings?.ui_page_layout || {};
      const page = allLayout[pathKey] || {};
      const inlineSections = { ...(page.inlineSections || {}) };
      delete inlineSections[selected.key];
      await save({ ...settings, ui_page_layout: { ...allLayout, [pathKey]: { ...page, inlineSections } } });
      applyStyle(selected.element, {}); setSelected(null);
    } finally { setSaving(false); }
  };

  return <>{toggle}{createPortal(<div className="nst-inline-editor-modal" role="dialog" aria-modal="true" aria-label="Section design editor">
    <button className="nst-inline-editor-backdrop" type="button" onClick={close} aria-label="Close editor" />
    <div className="nst-inline-editor-sheet">
      <div className="nst-inline-editor-head"><div><span>SUPER ADMIN · QUICK DESIGN</span><h2>{selected.title}</h2><p>Only this section/card. Changes save here and remain after refresh.</p></div><button type="button" onClick={close}><X size={18}/></button></div>
      <div className="nst-inline-editor-grid">
        <label className="is-wide"><span>Background color</span><input type="text" value={draft.background} onChange={(e)=>setDraft({...draft,background:e.target.value})} placeholder="#0f1b2d / rgba(...) / var(--token)" /></label>
        <label><span>Border color</span><input type="text" value={draft.borderColor} onChange={(e)=>setDraft({...draft,borderColor:e.target.value})} placeholder="#26364d" /></label>
        <label><span>Border width</span><input type="number" min="0" max="8" value={draft.borderWidth} onChange={(e)=>setDraft({...draft,borderWidth:e.target.value})} placeholder="1" /></label>
        <label><span>Radius</span><input type="number" min="0" max="48" value={draft.radius} onChange={(e)=>setDraft({...draft,radius:e.target.value})} placeholder="12" /></label>
        <label><span>Padding</span><input type="number" min="0" max="64" value={draft.padding} onChange={(e)=>setDraft({...draft,padding:e.target.value})} placeholder="16" /></label>
        <label><span>Shadow</span><select value={draft.shadow} onChange={(e)=>setDraft({...draft,shadow:e.target.value})}><option value="keep">Default</option><option value="none">None</option><option value="soft">Soft</option></select></label>
        <label className="nst-inline-check is-wide"><input type="checkbox" checked={Boolean(draft.transparent)} onChange={(e)=>setDraft({...draft,transparent:e.target.checked})}/><span>Transparent background</span></label>
      </div>
      {message && <p className="nst-inline-editor-message">{message}</p>}
      <div className="nst-inline-editor-actions"><button type="button" className="is-reset" onClick={reset} disabled={saving}><RotateCcw size={16}/>Reset section</button><button type="button" className="is-save" onClick={persist} disabled={saving}><Save size={16}/>{saving?'Saving…':'Save this section'}</button></div>
      <div className="nst-inline-editor-note"><Paintbrush size={16}/> Tip: leave a field blank to keep the shared/global design value.</div>
    </div>
  </div>, document.body)}</>;
}
