const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212',
  '112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131',
  '311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321',
  '112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121',
  '313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114',
  '122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212',
  '124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113',
  '114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'
];

export const NST_BARCODE_LABEL = Object.freeze({
  widthMm: 40,
  heightMm: 30,
  encoding: 'CODE128',
  key: 'NST_FINAL_30x40',
});

export function escapeBarcodeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function code128Svg(value) {
  const text = String(value || '').trim();
  if (!text || [...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126)) {
    return '';
  }

  const codes = [104];
  for (const char of text) codes.push(char.charCodeAt(0) - 32);

  let checksum = 104;
  for (let i = 1; i < codes.length; i += 1) checksum += codes[i] * i;
  checksum %= 103;
  codes.push(checksum, 106);

  let x = 0;
  const bars = [];

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) return '';

    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i]);
      if (i % 2 === 0) {
        bars.push(`<rect x="${x}" y="0" width="${width}" height="44"/>`);
      }
      x += width;
    }
  }

  return `<svg viewBox="0 0 ${x} 44" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CODE128 ${escapeBarcodeHtml(text)}">${bars.join('')}</svg>`;
}

export function normalizeBarcodeItem(item = {}) {
  const barcode = String(item.barcode || '').trim();
  const sku = String(item.sku || '').trim();
  const price = Number(item.sale_price ?? item.selling_price ?? item.price ?? 0);

  return {
    ...item,
    barcode,
    sku,
    encoded_value: barcode || sku,
    product_name:
      item.display_product_name ||
      item.product_name ||
      item.product_db_name ||
      item.name ||
      'Product',
    color_name: item.color_name || item.color || '',
    region: item.region || item.country_region || '',
    sim_network: item.sim_network || item.network_carrier || item.sim_type || '',
    ram: item.ram || '',
    storage: item.storage || '',
    sale_price: Number.isFinite(price) ? price : 0,
  };
}

export function buildNstLabelTitle(rawItem, { hideIphoneRam = true } = {}) {
  const item = normalizeBarcodeItem(rawItem);
  const product = item.product_name || 'Product';
  const pieces = [];

  if (item.color_name) pieces.push(item.color_name);
  if (item.region) pieces.push(item.region);
  if (item.sim_network) pieces.push(item.sim_network);

  const isIphone = /^iphone\b/i.test(product.trim());
  const ram = String(item.ram || '').trim();
  const storage = String(item.storage || '').trim();

  if (storage) {
    if (ram && !(hideIphoneRam && isIphone)) pieces.push(`${ram}/${storage}`);
    else pieces.push(storage);
  } else if (ram && !(hideIphoneRam && isIphone)) {
    pieces.push(ram);
  }

  if (!pieces.length && item.variant_display) pieces.push(item.variant_display);

  return [product, ...pieces].filter(Boolean).join(' / ');
}

export function taka(value) {
  return `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
}

export const LABEL_TEXT_ALIGNMENTS = ['left', 'center', 'right'];

/** Template settings saved by Barcode Tools (snake_case) -> label options. */
export function labelOptionsFromTemplate(settings = {}) {
  return {
    widthMm: Number(settings.label_width_mm) || NST_BARCODE_LABEL.widthMm,
    heightMm: Number(settings.label_height_mm) || NST_BARCODE_LABEL.heightMm,
    copies: Math.max(1, Number(settings.copies) || 1),
    textAlign: LABEL_TEXT_ALIGNMENTS.includes(settings.alignment) ? settings.alignment : 'center',
    showProductName: settings.show_product_name !== false,
    showSalePrice: settings.show_sale_price !== false,
    showBarcodeText: settings.show_barcode_text !== false,
    showImei1: Boolean(settings.show_imei1),
    showImei2: Boolean(settings.show_imei2),
    hideIphoneRam: settings.hide_iphone_ram !== false,
    priceLabel: settings.price_label,
  };
}

function resolveOptions(options = {}) {
  return {
    widthMm: Number(options.widthMm) || NST_BARCODE_LABEL.widthMm,
    heightMm: Number(options.heightMm) || NST_BARCODE_LABEL.heightMm,
    copies: Math.max(1, Number(options.copies) || 1),
    textAlign: LABEL_TEXT_ALIGNMENTS.includes(options.textAlign) ? options.textAlign : 'center',
    showProductName: options.showProductName !== false,
    showSalePrice: options.showSalePrice !== false,
    showBarcodeText: options.showBarcodeText !== false,
    showImei1: Boolean(options.showImei1),
    showImei2: Boolean(options.showImei2),
    hideIphoneRam: options.hideIphoneRam !== false,
    priceLabel: options.priceLabel ?? 'Sale Price',
    missingLabel: options.missingLabel ?? 'Barcode/SKU missing',
  };
}

export function buildNstLabelMarkup(rawItem, options = {}) {
  const cfg = resolveOptions(options);
  const item = normalizeBarcodeItem(rawItem);
  const encoded = item.encoded_value;
  const title = buildNstLabelTitle(item, cfg);
  const titleLine = cfg.showProductName ? `<div class="product-line">${escapeBarcodeHtml(title)}</div>` : '';

  if (!encoded) {
    return `<section class="nst-label align-${cfg.textAlign}">${titleLine}<div class="missing">${escapeBarcodeHtml(cfg.missingLabel)}</div></section>`;
  }

  const price = cfg.showSalePrice
    ? `<span class="price">${cfg.priceLabel ? `${escapeBarcodeHtml(cfg.priceLabel)}: ` : ''}${escapeBarcodeHtml(taka(item.sale_price))}</span>`
    : '';

  return `
    <section class="nst-label align-${cfg.textAlign}">
      ${titleLine}
      <div class="value-line">
        <span>${escapeBarcodeHtml(item.barcode || item.sku)}</span>
        ${price}
      </div>
      <div class="barcode">${code128Svg(encoded)}</div>
      ${cfg.showBarcodeText ? `<div class="encoded">${escapeBarcodeHtml(encoded)}</div>` : ''}
      ${cfg.showImei1 && item.imei_1 ? `<div class="meta">IMEI1: ${escapeBarcodeHtml(item.imei_1)}</div>` : ''}
      ${cfg.showImei2 && item.imei_2 ? `<div class="meta">IMEI2: ${escapeBarcodeHtml(item.imei_2)}</div>` : ''}
    </section>
  `;
}

export function buildNstLabelStyles(options = {}) {
  const cfg = resolveOptions(options);
  return `
  @page { size: ${cfg.widthMm}mm ${cfg.heightMm}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font-family: Arial, "Noto Sans Bengali", sans-serif;
  }
  .nst-label {
    width: ${cfg.widthMm}mm;
    height: ${cfg.heightMm}mm;
    padding: 1.15mm 1.2mm .85mm;
    overflow: hidden;
    background: #fff;
    display: flex;
    flex-direction: column;
    page-break-after: always;
    break-after: page;
  }
  .nst-label:last-child { page-break-after: auto; break-after: auto; }
  .product-line {
    min-height: 5mm;
    max-height: 6.4mm;
    overflow: hidden;
    font-size: 7.3pt;
    line-height: 1.06;
    font-weight: 800;
  }
  .value-line {
    margin-top: .55mm;
    display: flex;
    gap: 1mm;
    font-size: 6.6pt;
    line-height: 1;
    font-weight: 900;
    white-space: nowrap;
  }
  .barcode {
    width: 100%;
    height: 12mm;
    margin-top: .8mm;
  }
  .barcode svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: #000;
  }
  .encoded {
    margin-top: .25mm;
    font: 700 6.2pt Consolas, "Courier New", monospace;
    letter-spacing: .15mm;
    white-space: nowrap;
  }
  .meta {
    font-size: 5.4pt;
    line-height: 1.05;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .missing {
    margin-top: 4mm;
    font-size: 8pt;
    font-weight: 800;
  }
  .align-center :is(.product-line, .encoded, .meta, .missing) { text-align: center; }
  .align-center .value-line { justify-content: space-between; }
  .align-left :is(.product-line, .encoded, .meta, .missing) { text-align: left; }
  .align-left .value-line { justify-content: flex-start; column-gap: 1.2mm; }
  .align-right :is(.product-line, .encoded, .meta, .missing) { text-align: right; }
  .align-right .value-line { justify-content: flex-end; column-gap: 1.2mm; }
`;
}

export function buildNstBarcodePrintHtml(items = [], options = {}) {
  const cfg = resolveOptions(options);
  const labels = items.flatMap((item) =>
    Array.from({ length: cfg.copies }, () => buildNstLabelMarkup(item, options))
  );
  const zoom = Number(options.previewZoom) > 0 ? `html { zoom: ${Number(options.previewZoom)}; }` : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeBarcodeHtml(options.documentTitle || 'Barcode Labels')}</title>
<style>${buildNstLabelStyles(options)}${zoom}</style>
</head>
<body>${labels.join('')}</body>
</html>`;
}
