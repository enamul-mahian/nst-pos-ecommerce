import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FileSearch,
  Loader2,
  Palette,
  Plus,
  Save,
  Send,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  fetchWebsiteBuilderDraft,
  publishWebsiteBuilderDraft,
  saveWebsiteBuilderDraft,
} from '../../services/websiteBuilderService';
import { NstPageHeader } from '../../components/ui/nst-page-header';

const paletteCatalog = [
  { id: 'palette-7', name: 'NST Green', primary: '#059669' },
  { id: 'palette-8', name: 'Forest', primary: '#166534' },
  { id: 'palette-6', name: 'Teal', primary: '#0f766e' },
  { id: 'palette-20', name: 'Aqua', primary: '#0891b2' },
  { id: 'palette-5', name: 'Sky', primary: '#0284c7' },
  { id: 'palette-3', name: 'Blue', primary: '#2563eb' },
  { id: 'palette-4', name: 'Navy', primary: '#1e3a8a' },
  { id: 'palette-17', name: 'Graphite', primary: '#334155' },
  { id: 'palette-18', name: 'Midnight', primary: '#111827' },
  { id: 'palette-10', name: 'Amber', primary: '#d97706' },
  { id: 'palette-11', name: 'Orange', primary: '#ea580c' },
  { id: 'palette-12', name: 'Coral', primary: '#f97316' },
  { id: 'palette-13', name: 'Ruby', primary: '#dc2626' },
  { id: 'palette-14', name: 'Rose', primary: '#e11d48' },
  { id: 'palette-15', name: 'Pink', primary: '#db2777' },
  { id: 'palette-16', name: 'Fuchsia', primary: '#c026d3' },
  { id: 'palette-1', name: 'Purple', primary: '#6524c4' },
  { id: 'palette-2', name: 'Royal Violet', primary: '#7c3aed' },
  { id: 'palette-9', name: 'Lime', primary: '#65a30d' },
  { id: 'palette-19', name: 'Gold', primary: '#a16207' },
];

const pages = [
  'home',
  'category',
  'brand',
  'product',
  'cart',
  'checkout',
  'order-confirmation',
  'login-register',
  'customer-dashboard',
  'orders',
  'compare',
  'wishlist',
  'preorder',
  'blog',
  'contact',
  'about',
  'emi-calculator',
  'imei-check',
  'downloads',
];

const effects = ['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom', 'scale', 'parallax', 'reveal', 'stagger'];

const initialAdvanced = {
  themeEngine: { activePalette: 'palette-7', palettes: paletteCatalog },
  pageSeo: pages.map((slug) => ({
    slug,
    metaTitle: '',
    metaDescription: '',
    featuredImage: '',
    canonical: '',
    robots: 'index,follow',
    faqs: [],
  })),
  animationDefaults: {
    entrance: 'fade',
    exit: 'fade',
    hover: 'lift',
    direction: 'left-to-right',
    duration: 550,
    delay: 0,
    easing: 'easeOut',
    intensity: 1,
  },
  brandPage: { autoPreorderWhenOutOfStock: true },
  mobile: { bottomNavEnabled: true },
};

const normalizeAdvanced = (raw = {}) => ({
  ...initialAdvanced,
  ...raw,
  themeEngine: {
    ...initialAdvanced.themeEngine,
    ...(raw.themeEngine || {}),
    palettes: paletteCatalog,
  },
  pageSeo: Array.isArray(raw.pageSeo) && raw.pageSeo.length ? raw.pageSeo : initialAdvanced.pageSeo,
  animationDefaults: {
    ...initialAdvanced.animationDefaults,
    ...(raw.animationDefaults || {}),
  },
  brandPage: {
    ...initialAdvanced.brandPage,
    ...(raw.brandPage || {}),
  },
  mobile: {
    ...initialAdvanced.mobile,
    ...(raw.mobile || {}),
  },
});

function Field({ label, value, onChange, type = 'text', hint }) {
  return (
    <label className="block space-y-1.5 text-xs font-black uppercase tracking-[0.07em] text-slate-600">
      <span>{label}</span>
      {type === 'textarea' ? (
        <textarea
          rows={3}
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
        />
      ) : (
        <input
          type={type}
          value={value ?? ''}
          onChange={(event) => onChange(type === 'number' ? Number(event.target.value) : event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
        />
      )}
      {hint ? <small className="block font-medium normal-case tracking-normal text-slate-400">{hint}</small> : null}
    </label>
  );
}

const tabs = [
  { id: 'themes', label: 'Theme', icon: Palette },
  { id: 'seo', label: 'SEO & FAQ', icon: FileSearch },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
];

export default function WebsiteExperienceCenter() {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('themes');

  useEffect(() => {
    fetchWebsiteBuilderDraft()
      .then((data) => {
        const draft = data.draft || {};
        setContent({
          ...draft,
          advanced: normalizeAdvanced(draft.advanced || {}),
        });
      })
      .catch((error) => setMessage(error?.response?.data?.message || 'Website experience settings could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const setAdv = (key, value) => {
    setContent((current) => ({
      ...current,
      advanced: {
        ...current.advanced,
        [key]: value,
      },
    }));
  };

  const save = async (publish = false) => {
    setMessage('');
    await saveWebsiteBuilderDraft(content);
    if (publish) await publishWebsiteBuilderDraft();
    setMessage(publish ? 'Website experience published successfully.' : 'Draft saved successfully.');
  };

  if (loading || !content) {
    return (
      <div className="grid min-h-[280px] place-items-center p-10">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
          <Loader2 className="animate-spin text-emerald-700" size={18} />
          Loading website experience…
        </div>
      </div>
    );
  }

  const a = normalizeAdvanced(content.advanced || {});
  const activePalette = paletteCatalog.find((item) => item.id === a.themeEngine.activePalette);
  const websitePrimary = content.site?.primaryColor || activePalette?.primary || '#059669';

  const applyPalette = (palette) => {
    setAdv('themeEngine', {
      ...a.themeEngine,
      activePalette: palette.id,
      palettes: paletteCatalog,
    });
    setContent((current) => ({
      ...current,
      site: {
        ...(current.site || {}),
        primaryColor: palette.primary,
      },
    }));
  };

  return (
    <div className="nst-experience-center space-y-5 p-4 md:p-6">
      <NstPageHeader actions={<><div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => save(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              <Save size={16} />
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-emerald-800"
            >
              <Send size={16} />
              Publish
            </button>
          </div></>} icon={Palette} title={<>Experience & SEO</>} subtitle={<>Control storefront color, SEO, FAQ, animation defaults and responsive mobile behavior. File downloads are managed separately in File Center.
              </>}/>

      {message ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          {message}
        </div>
      ) : null}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="Website experience settings">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-black transition ${
                active
                  ? 'bg-emerald-700 text-white'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {tab === 'themes' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Storefront color</h2>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                NST Green is the default. Other colors are optional and only change storefront accent tokens—not page layout, spacing or component geometry.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="h-7 w-7 rounded-lg border border-black/5" style={{ background: websitePrimary }} />
              <div>
                <small className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Current accent</small>
                <b className="text-sm text-slate-800">{websitePrimary}</b>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {paletteCatalog.map((palette) => {
              const active = a.themeEngine.activePalette === palette.id || websitePrimary.toLowerCase() === palette.primary.toLowerCase();
              return (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => applyPalette(palette)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="h-8 w-8 shrink-0 rounded-lg border border-black/5" style={{ background: palette.primary }} />
                  <span className="min-w-0">
                    <b className="block truncate text-sm text-slate-800">{palette.name}</b>
                    <small className="text-xs font-semibold text-slate-400">{palette.primary}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Field
              type="color"
              label="Custom website accent"
              value={websitePrimary}
              onChange={(value) => {
                setAdv('themeEngine', { ...a.themeEngine, activePalette: 'custom', palettes: paletteCatalog });
                setContent((current) => ({
                  ...current,
                  site: { ...(current.site || {}), primaryColor: value },
                }));
              }}
              hint="Use only when a built-in palette does not match the brand."
            />
          </div>
        </section>
      ) : null}

      {tab === 'seo' ? (
        <section className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Page SEO & FAQ</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Open only the page you want to edit. Existing SEO and FAQ data is preserved.</p>
          </div>

          {a.pageSeo.map((page, index) => (
            <details key={page.slug} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer px-5 py-4 font-black capitalize text-slate-800 hover:bg-slate-50">
                {page.slug.replaceAll('-', ' ')}
              </summary>
              <div className="border-t border-slate-100 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Meta Title"
                    value={page.metaTitle}
                    onChange={(value) => setAdv('pageSeo', a.pageSeo.map((item, itemIndex) => itemIndex === index ? { ...item, metaTitle: value } : item))}
                  />
                  <Field
                    label="Featured Image"
                    value={page.featuredImage}
                    onChange={(value) => setAdv('pageSeo', a.pageSeo.map((item, itemIndex) => itemIndex === index ? { ...item, featuredImage: value } : item))}
                  />
                  <div className="md:col-span-2">
                    <Field
                      type="textarea"
                      label="Meta Description"
                      value={page.metaDescription}
                      onChange={(value) => setAdv('pageSeo', a.pageSeo.map((item, itemIndex) => itemIndex === index ? { ...item, metaDescription: value } : item))}
                    />
                  </div>
                  <Field
                    label="Canonical URL"
                    value={page.canonical}
                    onChange={(value) => setAdv('pageSeo', a.pageSeo.map((item, itemIndex) => itemIndex === index ? { ...item, canonical: value } : item))}
                  />
                  <Field
                    label="Robots"
                    value={page.robots}
                    onChange={(value) => setAdv('pageSeo', a.pageSeo.map((item, itemIndex) => itemIndex === index ? { ...item, robots: value } : item))}
                  />
                </div>

                <div className="mt-5 border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-800">FAQ</h3>
                      <p className="text-xs font-medium text-slate-400">Optional structured questions for this page.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdv('pageSeo', a.pageSeo.map((item, itemIndex) => itemIndex === index ? {
                        ...item,
                        faqs: [...(item.faqs || []), { question: 'New question', answer: 'New answer' }],
                      } : item))}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white"
                    >
                      <Plus size={14} />
                      Add FAQ
                    </button>
                  </div>

                  {(page.faqs || []).map((faq, faqIndex) => (
                    <div key={`${page.slug}-${faqIndex}`} className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-[1fr_1fr_auto]">
                      <Field
                        label="Question"
                        value={faq.question}
                        onChange={(value) => setAdv('pageSeo', a.pageSeo.map((item, itemIndex) => itemIndex === index ? {
                          ...item,
                          faqs: item.faqs.map((entry, entryIndex) => entryIndex === faqIndex ? { ...entry, question: value } : entry),
                        } : item))}
                      />
                      <Field
                        label="Answer"
                        value={faq.answer}
                        onChange={(value) => setAdv('pageSeo', a.pageSeo.map((item, itemIndex) => itemIndex === index ? {
                          ...item,
                          faqs: item.faqs.map((entry, entryIndex) => entryIndex === faqIndex ? { ...entry, answer: value } : entry),
                        } : item))}
                      />
                      <button
                        type="button"
                        aria-label="Remove FAQ"
                        onClick={() => setAdv('pageSeo', a.pageSeo.map((item, itemIndex) => itemIndex === index ? {
                          ...item,
                          faqs: item.faqs.filter((_, entryIndex) => entryIndex !== faqIndex),
                        } : item))}
                        className="mt-5 grid h-10 w-10 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </section>
      ) : null}

      {tab === 'effects' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Global effect defaults</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">Keep animation controlled and accessible. These settings do not change layout geometry.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="text-xs font-black uppercase tracking-[0.07em] text-slate-600">
              Entrance
              <select
                value={a.animationDefaults.entrance}
                onChange={(event) => setAdv('animationDefaults', { ...a.animationDefaults, entrance: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold normal-case tracking-normal outline-none focus:border-emerald-500"
              >
                {effects.map((effect) => <option key={effect}>{effect}</option>)}
              </select>
            </label>

            <label className="text-xs font-black uppercase tracking-[0.07em] text-slate-600">
              Exit
              <select
                value={a.animationDefaults.exit}
                onChange={(event) => setAdv('animationDefaults', { ...a.animationDefaults, exit: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold normal-case tracking-normal outline-none focus:border-emerald-500"
              >
                {effects.map((effect) => <option key={effect}>{effect}</option>)}
              </select>
            </label>

            <Field
              type="number"
              label="Duration (ms)"
              value={a.animationDefaults.duration}
              onChange={(value) => setAdv('animationDefaults', { ...a.animationDefaults, duration: value })}
            />
            <Field
              type="number"
              label="Delay (ms)"
              value={a.animationDefaults.delay}
              onChange={(value) => setAdv('animationDefaults', { ...a.animationDefaults, delay: value })}
            />
            <Field
              label="Direction"
              value={a.animationDefaults.direction}
              onChange={(value) => setAdv('animationDefaults', { ...a.animationDefaults, direction: value })}
            />
            <Field
              type="number"
              label="Intensity"
              value={a.animationDefaults.intensity}
              onChange={(value) => setAdv('animationDefaults', { ...a.animationDefaults, intensity: value })}
            />
          </div>
        </section>
      ) : null}

      {tab === 'mobile' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Responsive storefront</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">
            Mobile controls apply to the customer storefront only. Keep the website responsive and focused on customer navigation.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <input
                type="checkbox"
                checked={Boolean(a.mobile.bottomNavEnabled)}
                onChange={(event) => setAdv('mobile', { ...a.mobile, bottomNavEnabled: event.target.checked })}
                className="mt-1 h-4 w-4 accent-emerald-700"
              />
              <span>
                <b className="block text-sm text-slate-800">Mobile bottom navigation</b>
                <small className="mt-1 block text-xs font-medium leading-5 text-slate-500">
                  Customer mobile navigation: Home / Category / Cart / Wishlist / Account.
                </small>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <input
                type="checkbox"
                checked={Boolean(a.brandPage.autoPreorderWhenOutOfStock)}
                onChange={(event) => setAdv('brandPage', { ...a.brandPage, autoPreorderWhenOutOfStock: event.target.checked })}
                className="mt-1 h-4 w-4 accent-emerald-700"
              />
              <span>
                <b className="block text-sm text-slate-800">Out-of-stock preorder option</b>
                <small className="mt-1 block text-xs font-medium leading-5 text-slate-500">
                  Keep price visible and allow eligible logged-in customers to start preorder flow when inventory is unavailable.
                </small>
              </span>
            </label>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ['Mobile', '320px+'],
              ['Tablet', '768px+'],
              ['Desktop', '1024px+'],
            ].map(([label, width]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
                <small className="text-[10px] font-black uppercase tracking-wider text-emerald-700">{label}</small>
                <b className="mt-1 block text-lg text-slate-900">{width}</b>
                <span className="text-xs font-medium text-slate-400">Responsive renderer target</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
