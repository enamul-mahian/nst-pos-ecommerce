/**
 * Clean HTML that comes from the admin panel (product descriptions, specifications, CMS pages, blog, footer)
 * before it is rendered with dangerouslySetInnerHTML.
 *
 * Staff-written HTML could carry event handlers or javascript: links that run in a customer's browser and read
 * the customer login token from localStorage. This keeps normal formatting, images, tables and video embeds,
 * and removes anything that can execute script. It uses the browser's own DOMParser, so no extra dependency.
 */

const BLOCKED_TAGS = new Set([
  'script', 'style', 'object', 'embed', 'applet', 'form', 'input', 'button', 'textarea', 'select', 'option',
  'link', 'meta', 'base', 'frame', 'frameset', 'noscript', 'template', 'svg', 'math',
]);

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background', 'cite', 'srcset']);

// Video embeds that product pages commonly use.
const ALLOWED_IFRAME_HOSTS = [
  'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com',
  'www.facebook.com', 'www.google.com', 'maps.google.com',
];

const isSafeUrl = (value: string, allowDataImage: boolean): boolean => {
  // Browsers ignore control characters and whitespace inside the scheme ("java\tscript:").
  const compact = value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
  if (compact.startsWith('javascript:') || compact.startsWith('vbscript:')) return false;
  if (compact.startsWith('data:')) return allowDataImage && /^data:image\/(png|gif|jpe?g|webp|avif);/.test(compact);
  return true;
};

const isAllowedIframe = (src: string | null): boolean => {
  if (!src) return false;
  try {
    const url = new URL(src, window.location.origin);
    return url.protocol === 'https:' && ALLOWED_IFRAME_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
};

const cleanElement = (element: Element): void => {
  const tag = element.tagName.toLowerCase();

  if (BLOCKED_TAGS.has(tag) || (tag === 'iframe' && !isAllowedIframe(element.getAttribute('src')))) {
    element.remove();
    return;
  }

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const dangerousStyle = name === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(attribute.value);
    if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || dangerousStyle) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attribute.value, tag === 'img' && name === 'src')) {
      element.removeAttribute(attribute.name);
    }
  }

  if (tag === 'a' && element.getAttribute('target') === '_blank') {
    element.setAttribute('rel', 'noopener noreferrer');
  }
  if (tag === 'iframe') {
    element.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
  }

  for (const child of Array.from(element.children)) {
    cleanElement(child);
  }
};

export const sanitizeHtml = (html: unknown): string => {
  if (typeof html !== 'string' || html.trim() === '') return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    // No DOM (should not happen in this SPA): fall back to plain text so nothing can execute.
    return html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const child of Array.from(doc.body.children)) {
    cleanElement(child);
  }

  return doc.body.innerHTML;
};

export default sanitizeHtml;
