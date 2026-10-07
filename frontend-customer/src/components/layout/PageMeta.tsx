import { useEffect } from 'react';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';
import { useI18n } from '../../i18n';
import { localizedField, pageById } from '../../cms/sitePages';

/** Browser title and meta description saved for this page in the Website Control Center (Page settings). */
export default function PageMeta({ pageId }: { pageId: string }) {
  const cms = useWebsiteStore((state) => state.cms);
  const { language } = useI18n();
  const page = pageId ? pageById(cms, pageId) : undefined;
  const title = localizedField(page, 'metaTitle', language).trim();
  const description = localizedField(page, 'metaDescription', language).trim();

  useEffect(() => {
    if (!title) return undefined;
    const apply = () => { if (document.title !== title) document.title = title; };
    apply();
    const head = document.querySelector('head');
    const observer = new MutationObserver(apply);
    if (head) observer.observe(head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);

  useEffect(() => {
    if (!description) return;
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute('name', 'description'); document.head.appendChild(tag); }
    tag.setAttribute('content', description);
  }, [description]);

  return null;
}
