import { useEffect, useMemo, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Barcode, Check, Loader2, Printer, Save, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import corporateOpsService from '../../services/corporateOpsService';
import { buildNstBarcodePrintHtml, labelOptionsFromTemplate, LABEL_TEXT_ALIGNMENTS } from '../../utils/nstBarcodeLabel';
import { useT } from '../../i18n';
import { NstPageHeader, NstButton } from '../../components/ui';

const unwrap = (response) => response?.data?.data ?? response?.data ?? {};

const defaults = {
  encoding: 'CODE128',
  encoded_field: 'barcode',
  fallback_encoded_field: 'sku',
  show_barcode_text: true,
  show_product_name: true,
  show_sale_price: true,
  show_sku_text: false,
  show_imei1: false,
  show_imei2: false,
  show_branch: false,
  show_condition: false,
  hide_iphone_ram: true,
  label_width_mm: 40,
  label_height_mm: 30,
  alignment: 'center',
  font_size: 8,
  copies: 1,
};

function normalizeItem(item = {}) {
  const price = Number(item.sale_price ?? item.price ?? item.selling_price ?? 0);
  const barcode = String(item.barcode || '').trim();
  const sku = String(item.sku || '').trim();

  return {
    ...item,
    id: item.id,
    type: item.type || (item.imei_1 || item.imei_2 ? 'device' : 'product'),
    name: item.name || item.product_name || '',
    product_name: item.product_name || item.name || '',
    variant_display: item.variant_display || item.variant_name || '',
    sku,
    barcode,
    encoded_value: barcode || sku,
    sale_price: Number.isFinite(price) ? price : 0,
  };
}

const taka = (value) => `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

function labelOptions(settings, t) {
  return {
    ...labelOptionsFromTemplate(settings),
    priceLabel: t('barcode_tools.label.sale_price'),
    missingLabel: t('barcode_tools.label.missing'),
    documentTitle: t('barcode_tools.label.document_title'),
  };
}

function Preview({ item, settings }) {
  const t = useT();
  const options = labelOptions(settings, t);
  const zoom = 2;
  const width = Math.round(options.widthMm * 3.78 * zoom);
  const height = Math.round(options.heightMm * 3.78 * zoom);
  return (
    <div className="nst-barcode-preview rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-5">
      <iframe
        title={t('barcode_tools.preview_title')}
        className="mx-auto block rounded-md bg-white shadow-xl"
        style={{ width, height, border: 0 }}
        srcDoc={buildNstBarcodePrintHtml([item], { ...options, copies: 1, previewZoom: zoom })}
      />
      <p className="mt-3 text-center text-xs font-bold text-[var(--nst-dashboard-muted)]">
        {t('barcode_tools.preview_hint', { width: options.widthMm, height: options.heightMm })}
      </p>
    </div>
  );
}

export default function BarcodeToolsPage() {
  const t = useT();
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('NST 30x40');
  const [isDefault, setIsDefault] = useState(true);
  const [settings, setSettings] = useState(defaults);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(
    () =>
      normalizeItem(
        selected[0] ||
          results[0] || {
            type: 'device',
            id: 0,
            barcode: 'NST-224364200',
            sku: 'NST-224364200',
            product_name: 'iPhone 13 Pro',
            color_name: 'Blue',
            region: 'USA',
            sim_network: 'Dual',
            storage: '128GB',
            sale_price: 58000,
          }
      ),
    [selected, results]
  );

  const loadTemplates = async () => {
    const list = unwrap(await api.get('/barcode-label-templates'));
    const rows = Array.isArray(list) ? list : [];
    setTemplates(rows);
    const first = rows.find((x) => x.is_default) || rows[0];

    if (first) {
      setTemplateId(String(first.id));
      setTemplateName(first.name);
      setIsDefault(Boolean(first.is_default));
      setSettings({ ...defaults, ...first.settings, encoding: 'CODE128', encoded_field: 'barcode' });
    }
  };

  useEffect(() => {
    loadTemplates().catch(() => toast.error(t('barcode_tools.errors.templates_load')));
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }

      try {
        const found = unwrap(await corporateOpsService.barcodeSearch(q.trim()));
        setResults((Array.isArray(found) ? found : []).map(normalizeItem));
      } catch (error) {
        toast.error(error?.response?.data?.message || t('barcode_tools.errors.search'));
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [q]);

  const chooseTemplate = (id) => {
    const item = templates.find((x) => String(x.id) === String(id));
    setTemplateId(String(id));

    if (item) {
      setTemplateName(item.name);
      setIsDefault(Boolean(item.is_default));
      setSettings({ ...defaults, ...item.settings, encoding: 'CODE128', encoded_field: 'barcode' });
    }
  };

  const saveTemplate = async () => {
    setBusy(true);
    try {
      await api.post('/barcode-label-templates', {
        id: templateId ? Number(templateId) : null,
        name: templateName,
        is_default: isDefault,
        settings: {
          ...settings,
          encoding: 'CODE128',
          encoded_field: 'barcode',
          fallback_encoded_field: 'sku',
        },
      });
      toast.success(t('barcode_tools.template_saved'));
      await loadTemplates();
    } catch (error) {
      toast.error(error?.response?.data?.message || t('barcode_tools.errors.save'));
    } finally {
      setBusy(false);
    }
  };

  const addItem = (item) => {
    const normalized = normalizeItem(item);
    if (!normalized.encoded_value) {
      toast.error(t('barcode_tools.errors.no_code'));
      return;
    }

    setSelected((current) =>
      current.some((x) => x.type === normalized.type && x.id === normalized.id)
        ? current
        : [...current, normalized]
    );
  };

  const removeItem = (item) => {
    setSelected((current) => current.filter((x) => !(x.type === item.type && x.id === item.id)));
  };

  const print = async () => {
    if (!selected.length) {
      toast.error(t('barcode_tools.errors.select_one'));
      return;
    }

    const action = selected.some((item) => item.is_barcode_printed) ? 'reprint' : 'print';
    let reason = null;

    if (action === 'reprint') {
      reason = window.prompt(t('barcode_tools.reprint_reason'));
      if (!String(reason || '').trim()) return;
    }

    try {
      await api.post('/barcode-tools/log-v2', {
        items: selected.map((item) => ({
          type: item.type,
          id: item.id,
          barcode: item.barcode,
          sku: item.sku,
        })),
        action,
        reason,
        printer_type: 'thermal',
        copies: Math.max(1, Number(settings.copies) || 1),
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || t('barcode_tools.errors.history'));
      return;
    }

    const popup = window.open('', 'nst-final-30x40', 'width=900,height=760');
    if (!popup) {
      toast.error(t('barcode_tools.errors.popup'));
      return;
    }

    popup.document.open();
    popup.document.write(buildNstBarcodePrintHtml(selected, labelOptions(settings, t)));
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 250);
  };

  const patch = (key, value) =>
    setSettings((current) => ({
      ...current,
      [key]: value,
      encoding: 'CODE128',
      encoded_field: 'barcode',
      fallback_encoded_field: 'sku',
    }));

  return (
    <main className="min-h-full bg-[var(--nst-dashboard-bg)] p-4 text-[var(--nst-dashboard-text)] md:p-7">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <NstPageHeader
          variant="compact"
          icon={Barcode}
          title={t('barcode_tools.title')}
          subtitle={t('barcode_tools.subtitle')}
          actions={<NstButton variant="primary" icon={Printer} onClick={print}>{t('barcode_tools.print', { count: selected.length || '' }).trim()}</NstButton>}
        />

        <div className="grid gap-5 xl:grid-cols-[1fr_1.05fr]">
          <section className="space-y-4 rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5">
            <h2 className="text-lg font-black">{t('barcode_tools.step_select')}</h2>

            <label className="relative block">
              <Search className="absolute left-3 top-3 text-[var(--nst-dashboard-muted)]" size={18} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('barcode_tools.search_placeholder')}
                className="w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-transparent py-2.5 pl-10 pr-3 font-semibold outline-none"
              />
            </label>

            <div className="max-h-[420px] space-y-2 overflow-auto">
              {results.map((item) => {
                const active = selected.some((x) => x.type === item.type && x.id === item.id);
                return (
                  <button
                    key={`${item.type}:${item.id}`}
                    type="button"
                    onClick={() => addItem(item)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--nst-dashboard-border)] p-3 text-left hover:bg-[var(--nst-dashboard-primary-soft)]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-black">{item.name || t('barcode_tools.product_fallback')}</div>
                      <div className="mt-1 text-xs font-semibold text-[var(--nst-dashboard-muted)]">
                        {item.barcode || item.sku || t('barcode_tools.no_code')}
                        {item.imei_1 ? ` · IMEI1 ${item.imei_1}` : ''}
                        {item.imei_2 ? ` · IMEI2 ${item.imei_2}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-black">{taka(item.sale_price)}</div>
                      {active ? <Check className="ml-auto mt-1 text-emerald-600" size={18} /> : null}
                    </div>
                  </button>
                );
              })}
            </div>

            {selected.length > 0 && (
              <div className="space-y-2 border-t border-[var(--nst-dashboard-border)] pt-4">
                <div className="text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">{t('barcode_tools.selected')}</div>
                {selected.map((item) => (
                  <div
                    key={`selected:${item.type}:${item.id}`}
                    className="flex items-center justify-between rounded-xl bg-[var(--nst-dashboard-primary-soft)] px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm font-bold">{item.name || t('barcode_tools.product_fallback')}</span>
                    <button type="button" onClick={() => removeItem(item)} className="rounded-lg p-1">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-black">{t('barcode_tools.step_template')}</h2>
              <button
                type="button"
                onClick={saveTemplate}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] px-3 py-2 font-black"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {t('common.save')}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">
                {t('barcode_tools.template')}
                <select
                  value={templateId}
                  onChange={(e) => chooseTemplate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-transparent p-2.5 normal-case"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">
                {t('barcode_tools.name')}
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-transparent p-2.5 normal-case"
                />
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {[
                'show_product_name',
                'show_sale_price',
                'show_barcode_text',
                'show_imei1',
                'show_imei2',
                'hide_iphone_ram',
              ].map((key) => (
                <label key={key} className="flex items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] p-3 text-sm font-bold">
                  <input type="checkbox" checked={Boolean(settings[key])} onChange={(e) => patch(key, e.target.checked)} />
                  {t(`barcode_tools.fields.${key}`)}
                </label>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">
                {t('barcode_tools.width_mm')}
                <input
                  type="number"
                  value={settings.label_width_mm}
                  onChange={(e) => patch('label_width_mm', Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-transparent p-2.5"
                />
              </label>
              <label className="text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">
                {t('barcode_tools.height_mm')}
                <input
                  type="number"
                  value={settings.label_height_mm}
                  onChange={(e) => patch('label_height_mm', Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-transparent p-2.5"
                />
              </label>
              <label className="text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">
                {t('barcode_tools.copies')}
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={settings.copies}
                  onChange={(e) => patch('copies', Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-transparent p-2.5"
                />
              </label>
            </div>

            <div>
              <div className="text-xs font-black uppercase text-[var(--nst-dashboard-muted)]">{t('barcode_tools.text_align')}</div>
              <div className="mt-1 inline-flex rounded-xl border border-[var(--nst-dashboard-border)] p-1" role="radiogroup" aria-label={t('barcode_tools.text_align')}>
                {LABEL_TEXT_ALIGNMENTS.map((value) => {
                  const Icon = { left: AlignLeft, center: AlignCenter, right: AlignRight }[value];
                  const active = (settings.alignment || 'center') === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => patch('alignment', value)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${active ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'text-[var(--nst-dashboard-muted)]'}`}
                    >
                      <Icon size={16} />
                      {t(`barcode_tools.align.${value}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              {t('barcode_tools.make_default')}
            </label>

            <Preview item={preview} settings={settings} />
          </section>
        </div>
      </div>
    </main>
  );
}
