import { AlertCircle } from 'lucide-react';
import { useT } from '../../i18n';

const MAX_LENGTH = 100000;

function CodeBox({ label, hint, value, onChange, placeholder, rows = 10 }) {
  const text = value || '';
  return <label className="nst-wcc-field">
    <span className="nst-wcc-field__label">{label}<em>{text.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}</em></span>
    <textarea className="nst-wcc-code" rows={rows} maxLength={MAX_LENGTH} spellCheck={false} autoCapitalize="off" autoCorrect="off" value={text} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}/>
    {hint ? <small>{hint}</small> : null}
  </label>;
}

export const defaultSectionCode = () => ({ mode:'isolated', html:'', css:'', js:'', height:0, fullWidth:false });

/* Custom Code section: content tab (the code itself). */
export function CustomCodeContentFields({ section, onCode }) {
  const t = useT();
  const code = { ...defaultSectionCode(), ...(section?.code || {}) };
  return <>
    <div className="nst-wcc-warn"><AlertCircle size={16}/><span>{t('wcc_code.trust_warning')}</span></div>
    <CodeBox label={t('wcc_code.html')} hint={t('wcc_code.html_help')} value={code.html} onChange={(html) => onCode({ html })} placeholder={'<div class="my-box">\n  <h2>Hello</h2>\n</div>'}/>
    <CodeBox label={t('wcc_code.css')} hint={t('wcc_code.css_help')} value={code.css} onChange={(css) => onCode({ css })} placeholder={'.my-box { padding: 16px; }'} rows={7}/>
    <CodeBox label={t('wcc_code.js')} hint={t('wcc_code.js_help')} value={code.js} onChange={(js) => onCode({ js })} placeholder={"document.querySelector('.my-box')"} rows={7}/>
    <p className="nst-wcc-note">{t('wcc_code.preview_note')}</p>
  </>;
}

/* Custom Code section: design tab (how it is placed on the page). */
export function CustomCodeDesignFields({ section, onCode, Switch }) {
  const t = useT();
  const code = { ...defaultSectionCode(), ...(section?.code || {}) };
  return <>
    <div className="nst-wcc-pair"><span>{t('wcc_code.mode')}</span><select value={code.mode === 'inline' ? 'inline' : 'isolated'} onChange={(event) => onCode({ mode:event.target.value })}>
      <option value="isolated">{t('wcc_code.mode_isolated')}</option>
      <option value="inline">{t('wcc_code.mode_inline')}</option>
    </select></div>
    <p className="nst-wcc-note">{code.mode === 'inline' ? t('wcc_code.mode_inline_help') : t('wcc_code.mode_isolated_help')}</p>
    {code.mode !== 'inline' && <div className="nst-wcc-pair"><span>{t('wcc_code.height')}</span><select value={Number(code.height) || 0} onChange={(event) => onCode({ height:Number(event.target.value) })}>
      <option value={0}>{t('wcc_code.height_auto')}</option>
      {[120,200,300,400,500,600,800].map((px) => <option key={px} value={px}>{px}px</option>)}
    </select></div>}
    <div className="nst-wcc-pair"><span>{t('wcc_code.full_width')}</span><Switch checked={Boolean(code.fullWidth)} onChange={(value) => onCode({ fullWidth:value })} label={t('wcc_code.full_width')}/></div>
  </>;
}

/* Global tab: code for every storefront page (head / end of body). */
export function SiteCodeFields({ value, onChange, Switch }) {
  const t = useT();
  const code = { enabled:false, head:'', bodyEnd:'', ...(value || {}) };
  const set = (patch) => onChange({ ...code, ...patch });
  return <div className="nst-wcc-group"><h3>{t('wcc_code.site_title')} <Switch checked={Boolean(code.enabled)} onChange={(enabled) => set({ enabled })} label={t('wcc_code.site_enabled')}/></h3>
    <div className="nst-wcc-warn"><AlertCircle size={16}/><span>{t('wcc_code.site_warning')}</span></div>
    <CodeBox label={t('wcc_code.site_head')} hint={t('wcc_code.site_head_help')} value={code.head} onChange={(head) => set({ head })} placeholder={'<script src="https://example.com/widget.js" async></script>'} rows={6}/>
    <CodeBox label={t('wcc_code.site_body')} hint={t('wcc_code.site_body_help')} value={code.bodyEnd} onChange={(bodyEnd) => set({ bodyEnd })} placeholder={'<noscript>...</noscript>'} rows={6}/>
    <p className="nst-wcc-note">{t('wcc_code.site_note')}</p>
  </div>;
}
