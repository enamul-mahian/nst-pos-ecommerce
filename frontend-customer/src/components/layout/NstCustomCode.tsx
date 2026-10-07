import { useEffect } from 'react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { runScripts } from '../storefront/CustomCodeBlock';

/**
 * Site-wide code from Website Control Center > Global > Custom Code (published site only):
 * "head" goes into <head>, "body end" before </body>. Not loaded inside the editor preview.
 */
const MARK = 'data-nst-site-code';

function place(target: HTMLElement, where: string, html: string) {
  target.querySelectorAll(`[${MARK}="${where}"]`).forEach((node) => node.remove());
  if (!html.trim()) return;
  const template = document.createElement('template');
  template.innerHTML = html;
  const holder = document.createElement('div');
  holder.appendChild(template.content);
  runScripts(holder);
  Array.from(holder.children).forEach((node) => {
    node.setAttribute(MARK, where);
    target.appendChild(node);
  });
}

export default function NstCustomCode() {
  const code = useWebsiteStore((state: any) => state.cms?.site?.customCode) || {};
  const preview = useWebsiteStore((state: any) => state.isPreviewMode);
  const active = Boolean(code.enabled) && !preview;
  const head = active ? String(code.head || '') : '';
  const bodyEnd = active ? String(code.bodyEnd || '') : '';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    place(document.head, 'head', head);
  }, [head]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    place(document.body, 'body', bodyEnd);
  }, [bodyEnd]);

  return null;
}
