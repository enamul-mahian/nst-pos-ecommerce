import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';

/*
 * Custom Code section (Website Control Center > Add Section > Custom Code).
 *   isolated (default): HTML / CSS / JS run inside a sandboxed frame. The code cannot read the
 *                       visitor's login, cart or page, so it cannot touch prices or orders.
 *   inline:             code is placed straight into the page (for widgets that need the page).
 * Inside the editor preview both modes use the sandboxed frame.
 */
export interface SectionCode { html?: string; css?: string; js?: string; mode?: string; height?: number; fullWidth?: boolean }

const closeScript = (text: string) => text.replace(/<\/script/gi, '<\\/script');

/** Replaces each <script> with a fresh copy so the browser runs it (scripts added by innerHTML never run). */
export function runScripts(root: ParentNode) {
  root.querySelectorAll('script').forEach((old) => {
    const fresh = document.createElement('script');
    Array.from(old.attributes).forEach((attr) => fresh.setAttribute(attr.name, attr.value));
    fresh.textContent = old.textContent;
    old.replaceWith(fresh);
  });
}

let frameCounter = 0;

function frameDocument(code: SectionCode, frameId: string) {
  const reporter = `(function(){var id=${JSON.stringify(frameId)};function send(){try{var h=Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);parent.postMessage({type:'NST_CUSTOM_CODE_HEIGHT',id:id,height:h},'*');}catch(e){}}window.addEventListener('load',send);if(window.ResizeObserver){new ResizeObserver(send).observe(document.documentElement);}setTimeout(send,50);setTimeout(send,600);setTimeout(send,2000);})();`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">`
    + `<style>html,body{margin:0;padding:0;background:transparent;font-family:inherit;}</style>`
    + `<style>${String(code.css || '').replace(/<\/style/gi, '<\\/style')}</style></head><body>`
    + `${code.html || ''}`
    + (code.js ? `<script>${closeScript(String(code.js))}</script>` : '')
    + `<script>${reporter}</script></body></html>`;
}

const IsolatedFrame: React.FC<{ code: SectionCode; preview: boolean }> = ({ code, preview }) => {
  const frameId = useMemo(() => `nst-code-${++frameCounter}`, []);
  const fixed = Number(code.height) > 0 ? Math.min(Number(code.height), 4000) : 0;
  const [height, setHeight] = useState(fixed || 80);
  const srcDoc = useMemo(() => frameDocument(code, frameId), [code.html, code.css, code.js, frameId]);

  useEffect(() => {
    if (fixed) { setHeight(fixed); return undefined; }
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'NST_CUSTOM_CODE_HEIGHT' || data.id !== frameId) return;
      const next = Math.max(1, Math.min(Number(data.height) || 0, 6000));
      if (next) setHeight(next);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [frameId, fixed]);

  return (
    <iframe
      title="custom-code"
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
      referrerPolicy="no-referrer"
      loading="lazy"
      className="block w-full border-0"
      style={{ height, pointerEvents: preview ? 'none' : undefined }}
    />
  );
};

const InlineCode: React.FC<{ code: SectionCode }> = ({ code }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    node.innerHTML = `${code.css ? `<style>${code.css}</style>` : ''}${code.html || ''}`;
    runScripts(node);
    if (code.js) {
      const script = document.createElement('script');
      script.textContent = String(code.js);
      node.appendChild(script);
    }
    return () => { node.innerHTML = ''; };
  }, [code.html, code.css, code.js]);
  return <div ref={ref} className="nst-custom-code" />;
};

export const CustomCodeBlock: React.FC<{ section: any; preview: boolean }> = ({ section, preview }) => {
  const t = useT();
  const code: SectionCode = section?.code || {};
  const empty = !String(code.html || '').trim() && !String(code.css || '').trim() && !String(code.js || '').trim();
  if (empty) {
    if (!preview) return null;
    return (
      <div className="mx-auto mt-5 w-full max-w-[1320px] px-3 sm:px-4 lg:px-6">
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{t('pages.custom_code_empty')}</div>
      </div>
    );
  }
  const body = preview || code.mode !== 'inline' ? <IsolatedFrame code={code} preview={preview} /> : <InlineCode code={code} />;
  if (code.fullWidth) return <div className="mt-5 w-full">{body}</div>;
  return <div className="mx-auto mt-5 w-full max-w-[1320px] px-3 sm:px-4 lg:px-6">{body}</div>;
};
