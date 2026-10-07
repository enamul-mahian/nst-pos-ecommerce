import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import corporateOpsService from '../../services/corporateOpsService';
import QRCode from 'qrcode';

export default function SaleInvoice() {
  const { id } = useParams();
  const location = useLocation();
  const printed = useRef(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [printOptions, setPrintOptions] = useState({
    header: true,
    customer: true,
    items: true,
    totals: true,
    onlineCopy: true,
    verificationBarcode: true,
    terms: true,
    signatures: true,
  });
  const [printPaperSize, setPrintPaperSize] = useState('a4');
  const [printOrientation, setPrintOrientation] = useState('portrait');

  const autoPrint = location?.state?.autoPrint || new URLSearchParams(location.search).get('print') === '1';

  useEffect(() => {
    corporateOpsService
      .invoiceData(id)
      .then((r) => setData(r.data.data))
      .catch((e) => setErr(e?.response?.data?.message || 'Invoice load failed'));
  }, [id]);

  useEffect(() => {
    if (!data?.invoice_design) return;
    setPrintOptions((current) => ({
      ...current,
      onlineCopy: data.invoice_design.show_qr !== false,
      verificationBarcode: data.invoice_design.show_barcode !== false,
    }));
    setPrintPaperSize(normalizeManualPaperSize(data.invoice_design.page_size || 'a4'));
    setPrintOrientation(normalizeOrientation(data.invoice_design.page_orientation || data.invoice_design.orientation || 'portrait'));
  }, [data?.invoice_design?.show_qr, data?.invoice_design?.show_barcode, data?.invoice_design?.page_size, data?.invoice_design?.page_orientation, data?.invoice_design?.orientation]);

  useEffect(() => {
    if (autoPrint && data && !printed.current && data.invoice_design?.auto_print) {
      printed.current = true;
      setTimeout(() => openInvoicePrintWindow(data, printOptions, qrDataUrl, data.invoice_design?.page_size || 'a4', data.invoice_design?.page_orientation || data.invoice_design?.orientation || 'portrait'), 450);
    }
  }, [autoPrint, data, printOptions, qrDataUrl]);

  useEffect(() => {
    const publicUrl = data?.invoice?.public_url;
    if (!publicUrl) { setQrDataUrl(''); return; }
    let active = true;
    QRCode.toDataURL(publicUrl, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setQrDataUrl(''); });
    return () => { active = false; };
  }, [data?.invoice?.public_url]);

  const send = async (type) => {
    setSending(true);
    try {
      await corporateOpsService.sendInvoice(id, {
        send_sms: type !== 'email',
        send_email: type !== 'sms',
        attach_pdf: true,
      });
      alert('Invoice communication processed. Check message logs.');
    } catch (e) {
      alert(e?.response?.data?.message || 'Could not send invoice communication.');
    } finally {
      setSending(false);
    }
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await corporateOpsService.downloadInvoicePdf(id);
      const type = res?.headers?.['content-type'] || 'application/pdf';
      const blob = new Blob([res.data], { type });

      if (type.includes('application/json')) {
        const message = await blob.text();
        alert(message || 'PDF download failed.');
        return;
      }

      const invoiceNo = data?.invoice?.invoice_no || `invoice-${id}`;
      const safeName = String(invoiceNo).replace(/[^A-Za-z0-9_-]/g, '_');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      const status = e?.response?.status;
      alert(status === 401 ? 'PDF download failed because login token was not sent. Please login again and retry.' : (e?.response?.data?.message || 'PDF download failed.'));
    } finally {
      setDownloading(false);
    }
  };

  if (err) {
    return <div className="p-6"><div className="bg-red-50 text-red-700 border rounded-xl p-4">{err}</div></div>;
  }

  if (!data) {
    return <div className="p-6">Invoice loading...</div>;
  }

  const inv = data.invoice || {};
  const company = data.company || {};
  const design = data.invoice_design || {};
  const currency = company.currency_symbol || '৳';

  return (
    <div className="p-4 md:p-6 bg-slate-100 min-h-screen invoice-screen">
      <style>{screenPrintCss(design)}</style>

      <div className="no-print mb-4 flex flex-wrap gap-2 justify-between">
        <div>
          <h1 className="text-2xl font-black">Invoice View / Print</h1>
          <p className="text-slate-500 text-sm">Only invoice area will print. Sidebar/header will not be printed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/sales" className="btn-light">Back</Link>
          <label className="print-select-label">Paper Size
            <select value={printPaperSize} onChange={(event) => setPrintPaperSize(event.target.value)} className="print-select">
              <option value="a4">A4 Full (210 x 297 mm)</option>
              <option value="a5">A5 (148 x 210 mm)</option>
            </select>
          </label>
          <label className="print-select-label">Orientation
            <select value={printOrientation} onChange={(event) => setPrintOrientation(event.target.value)} className="print-select">
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <button onClick={() => openInvoicePrintWindow(data, printOptions, qrDataUrl, printPaperSize, printOrientation)} className="btn-dark">Print Invoice</button>
          <button disabled={downloading} onClick={downloadPdf} className="btn">{downloading ? 'Downloading...' : 'Download PDF'}</button>
          <button disabled={sending} onClick={() => send('sms')} className="btn-light">Send SMS</button>
          <button disabled={sending} onClick={() => send('email')} className="btn-light">Send Email</button>
          <button disabled={sending} onClick={() => send('both')} className="btn-light">Send Both</button>
        </div>
      </div>

      <div className="no-print mx-auto mb-4 max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-black text-slate-900">Invoice Printable Portion</h2><p className="text-xs text-slate-500">Select invoice blocks, paper size and Portrait/Landscape orientation. Print CSS now lets the browser own the physical page box and keeps invoice content inside the printable area, preventing A5/A4 shrink-to-fit caused by a full-sheet-width wrapper. For best output keep browser Scale at Default/100%. Branch invoice profile can set the default.</p></div>
          <button type="button" onClick={() => setPrintOptions({ header:true, customer:true, items:true, totals:true, onlineCopy:true, verificationBarcode:true, terms:true, signatures:true })} className="btn-light">Select All</button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[['header','Company & invoice header'],['customer','Customer/branch information'],['items','Product/IMEI table'],['totals','Amount and totals'],['onlineCopy','Scan to Verify QR'],['verificationBarcode','Sales Record barcode'],['terms','Terms & conditions'],['signatures','Signature lines']].map(([key,label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={printOptions[key]} onChange={(event) => setPrintOptions((current) => ({ ...current, [key]: event.target.checked }))}/><span>{label}</span></label>
          ))}
        </div>
      </div>

      <div className="invoice-page relative max-w-5xl mx-auto bg-white rounded-2xl shadow-xl p-6 md:p-8 overflow-hidden">
        <Watermark text={design.watermark_text} show={design.watermark_show} />
        <div className="relative z-10">
          {printOptions.header && <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 invoice-header">
            <div className="company-block">
              {company.logo_url ? <img src={company.logo_url} alt="Logo" className="h-14 mb-2 object-contain" /> : null}
              <h2 className="text-3xl font-black text-slate-900">{company.name || 'New Singapur Telecom'}</h2>
              <p className="text-sm text-slate-500">{company.address}</p>
              <p className="text-sm text-slate-500">{company.phone} {company.email ? `• ${company.email}` : ''}</p>
              {company.website ? <p className="text-sm text-slate-500">{company.website}</p> : null}
              {company.vat_bin ? <p className="text-sm text-slate-500">BIN/VAT: {company.vat_bin}</p> : null}
            </div>
            <div className="text-left md:text-right invoice-title-block">
              <h3 className="text-xl font-black">INVOICE</h3>
              <p className="font-bold">{inv.invoice_no}</p>
              <p className="text-sm text-slate-500">{inv.date}</p>
              <span className="inline-block mt-2 px-3 py-1 rounded-full bg-slate-100 text-xs font-bold">{inv.status} / {inv.payment_status}</span>
            </div>
          </div>}

          {printOptions.customer && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 invoice-info-grid">
            <Info title="Bill To" rows={[["Name", data.customer?.name || 'Walk-in'], ["Phone", data.customer?.phone || '-'], ["Email", data.customer?.email || '-']]} />
            <Info title="Branch & Staff" rows={[["Branch", data.branch?.name || '-'], ["Sold By", data.staff?.sold_by || '-'], ["Receiver", data.staff?.payment_received_by || '-']]} />
          </div>}

          {printOptions.items && <div className="overflow-auto mt-6 invoice-table-wrap">
            <table className="w-full text-sm invoice-table">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-3 text-left">Product</th>
                  <th>IMEI</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Total</th>
                  <th>Warranty</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((i, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-3 font-semibold">{i.product_name}<p className="text-xs text-slate-500">SKU: {i.sku || '-'}</p></td>
                    <td>{[i.imei_1, i.imei_2].filter(Boolean).length ? [i.imei_1, i.imei_2].filter(Boolean).map((value) => <div key={value}>{value}</div>) : '-'}</td>
                    <td className="text-center">{i.quantity}</td>
                    <td className="text-right">{currency}{formatMoney(i.unit_price)}</td>
                    <td className="text-right font-bold">{currency}{formatMoney(i.line_total)}</td>
                    <td>{i.warranty_type || '-'}<br /><span className="text-xs">{i.warranty_end_date || ''}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}

          {(printOptions.totals || printOptions.onlineCopy || printOptions.verificationBarcode) && <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6 invoice-bottom-grid">
            <div>
              {printOptions.totals && <><p className="font-bold">Amount in Words:</p><p className="text-slate-700">{inv.amount_in_words}</p></>}
              {(printOptions.verificationBarcode || printOptions.onlineCopy) && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 invoice-verification-row">
                {printOptions.verificationBarcode && <div className="rounded-xl border border-slate-200 p-3 verification-barcode-block"><p className="font-black">Sales Record</p><div className="mt-2 h-14 max-w-sm" dangerouslySetInnerHTML={{ __html: barcodeSvg(inv.invoice_no || '') }}/><p className="mt-1 font-mono text-xs font-black">{inv.invoice_no}</p></div>}
                {printOptions.onlineCopy && <div className="rounded-xl border border-slate-200 p-3 online-copy-block"><p className="font-black">Scan to Verify</p>{qrDataUrl ? <img src={qrDataUrl} alt="Verify invoice QR" className="mt-2 h-24 w-24"/> : null}</div>}
              </div>}
            </div>
            {printOptions.totals && <div className="bg-slate-50 rounded-2xl p-4 space-y-2 invoice-totals">
              <Row k="Subtotal" v={inv.subtotal} currency={currency} />
              <Row k="Discount" v={(Number(inv.discount) || 0) + (Number(inv.coupon_discount) || 0)} currency={currency} />
              <Row k="Delivery" v={inv.delivery_charge} currency={currency} />
              <Row k="Final Amount" v={inv.final_amount} bold currency={currency} />
              <Row k="Paid" v={inv.paid_amount} currency={currency} />
              <Row k="Due" v={inv.due_amount} bold currency={currency} />
            </div>}
          </div>}

          {printOptions.terms && <div className="mt-6 border-t pt-4 text-xs text-slate-600 invoice-terms"><b>Terms & Conditions:</b><br />{design.terms}</div>}
          {printOptions.signatures && <div className="mt-10 flex justify-between text-sm invoice-signatures"><span>Customer Signature</span><span>{design.signature_label || 'Authorized Signature'}</span></div>}
        </div>
      </div>

      <style>{`.btn{background:var(--nst-dashboard-primary);color:white;border-radius:12px;padding:10px 14px;font-weight:800}.btn-dark{background:#0f172a;color:white;border-radius:12px;padding:10px 14px;font-weight:800}.btn-light{background:white;border:1px solid #e5e7eb;color:#0f172a;border-radius:12px;padding:10px 14px;font-weight:800}.print-select-label{display:flex;align-items:center;gap:7px;background:white;border:1px solid #e5e7eb;color:#0f172a;border-radius:12px;padding:6px 8px;font-size:12px;font-weight:800}.print-select{border:0;background:#f8fafc;border-radius:8px;padding:5px 7px;font-weight:800;outline:none}.btn:disabled,.btn-light:disabled{opacity:.55;cursor:not-allowed}`}</style>
    </div>
  );
}

function Info({ title, rows }) {
  return <div className="bg-slate-50 rounded-2xl p-4 invoice-info-card"><h4 className="font-black mb-2">{title}</h4>{rows.map(([k, v]) => <p key={k} className="text-sm"><span className="text-slate-500">{k}:</span> <b>{v}</b></p>)}</div>;
}

function Row({ k, v, bold, currency }) {
  return <div className={`flex justify-between ${bold ? 'font-black text-lg' : ''}`}><span>{k}</span><span>{currency}{formatMoney(v)}</span></div>;
}

function Watermark({ text, show }) {
  return show ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-black text-slate-900/5 rotate-[-25deg] select-none invoice-watermark">{text || 'New Singapur Telecom'}</div> : null;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function normalizeManualPaperSize(value = 'a4') {
  const size = String(value || 'a4').toLowerCase();
  return size.includes('a5') || size.includes('half') ? 'a5' : 'a4';
}

function normalizeOrientation(value = 'portrait') {
  return String(value || 'portrait').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
}

function pageGeometry(design = {}) {
  const margin = Math.max(0, Math.min(25, Number(design.margin_mm ?? 10) || 10));
  const size = String(design.page_size || 'a4').toLowerCase();
  const orientation = normalizeOrientation(design.page_orientation || design.orientation || 'portrait');

  if (size.includes('thermal_58') || size === '58mm') {
    return { isThermal:true, widthMm:58, heightMm:null, marginMm:2, orientation:'portrait', paperName:'58mm', pageRule:'size:58mm auto;margin:0;' };
  }
  if (size.includes('thermal_80') || size === '80mm') {
    return { isThermal:true, widthMm:80, heightMm:null, marginMm:3, orientation:'portrait', paperName:'80mm', pageRule:'size:80mm auto;margin:0;' };
  }

  const isA5 = size.includes('half') || size === 'a5';
  const paperName = isA5 ? 'A5' : 'A4';
  const portrait = isA5 ? [148, 210] : [210, 297];
  const widthMm = orientation === 'landscape' ? portrait[1] : portrait[0];
  const heightMm = orientation === 'landscape' ? portrait[0] : portrait[1];

  return {
    isThermal:false,
    widthMm,
    heightMm,
    marginMm:margin,
    orientation,
    paperName,
    pageRule:`size:${paperName} ${orientation};margin:${margin}mm;`,
  };
}

function screenPrintCss(design = {}) {
  const geometry = pageGeometry(design);
  return `
    @media print{
      @page{${geometry.pageRule}}
      html,body{background:white!important;margin:0!important;padding:0!important;width:auto!important;min-width:0!important;max-width:none!important;min-height:0!important;}
      body *{visibility:hidden!important;}
      .invoice-page,.invoice-page *{visibility:visible!important;}
      .invoice-page{position:relative!important;left:auto!important;top:auto!important;width:100%!important;min-width:0!important;max-width:none!important;min-height:0!important;box-shadow:none!important;margin:0!important;border:0!important;border-radius:0!important;padding:0!important;overflow:visible!important;box-sizing:border-box!important;}
      .no-print,.app-sidebar,.sidebar,header,nav,.topbar{display:none!important;visibility:hidden!important;}
      .invoice-screen{background:white!important;padding:0!important;min-height:auto!important;}
      .invoice-table thead tr{background:#0f172a!important;color:white!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
      .invoice-watermark{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    }
  `;
}

function pageCss(design = {}) {
  return pageGeometry(design).pageRule;
}

function openInvoicePrintWindow(data, printOptions = {}, qrDataUrl = '', pageSize = '', orientation = '') {
  const win = window.open('', '_blank', 'width=980,height=720');
  if (!win) {
    alert('Popup blocked. Please allow popups for this site and try again.');
    return;
  }

  win.document.open();
  win.document.write(buildStandaloneInvoiceHtml(data, printOptions, qrDataUrl, pageSize, orientation));
  win.document.close();
  win.focus();

  const runPrint = () => {
    try {
      win.print();
    } catch (e) {
      // ignore browser print errors
    }
  };

  setTimeout(runPrint, 550);
}

function buildStandaloneInvoiceHtml(data, printOptions = {}, qrDataUrl = '', pageSize = '', orientation = '') {
  const inv = data.invoice || {};
  const company = data.company || {};
  const design = {
    ...(data.invoice_design || {}),
    ...(pageSize ? { page_size: pageSize } : {}),
    ...(orientation ? { page_orientation: normalizeOrientation(orientation) } : {}),
  };
  const show = { header:true, customer:true, items:true, totals:true, onlineCopy:true, verificationBarcode:true, terms:true, signatures:true, ...printOptions };
  const currency = company.currency_symbol || '৳';
  const geometry = pageGeometry(design);
  const page = geometry.pageRule;
  const isThermal = geometry.isThermal;
  const isA5 = normalizeManualPaperSize(design.page_size || 'a4') === 'a5';
  const printPagePadding = isThermal ? `${geometry.marginMm}mm` : '0';
  const layoutClass = `${isA5 ? 'paper-a5' : 'paper-a4'} ${geometry.orientation === 'landscape' ? 'orientation-landscape' : 'orientation-portrait'}`;
  const rows = (data.items || []).map((i) => `
    <tr>
      <td><b>${esc(i.product_name || '-')}</b><div class="muted tiny">SKU: ${esc(i.sku || '-')}</div></td>
      <td>${[i.imei_1, i.imei_2].filter(Boolean).map((value) => `<div>${esc(value)}</div>`).join('') || '-'}</td>
      <td class="center">${esc(i.quantity || 1)}</td>
      <td class="right">${esc(currency)}${esc(formatMoney(i.unit_price))}</td>
      <td class="right bold">${esc(currency)}${esc(formatMoney(i.line_total))}</td>
      <td>${esc(i.warranty_type || '-')}<br><span class="tiny">${esc(i.warranty_end_date || '')}</span></td>
    </tr>
  `).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(inv.invoice_no || 'Invoice')}</title>
<style>
  @page{${page}}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;width:auto;min-width:0;max-width:none;background:#fff;}
  body{color:#0f172a;font-family:Roboto,Kalpurush,'Noto Sans Bengali',Arial,Helvetica,sans-serif;font-size:${isThermal ? '10px' : '13px'};-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{position:relative;width:100%;min-width:0;max-width:none;margin:0;padding:${printPagePadding};overflow:visible;box-sizing:border-box;}
  .watermark{position:fixed;inset:0;display:${design.watermark_show ? 'flex' : 'none'};align-items:center;justify-content:center;font-size:${isThermal ? '18px' : '64px'};font-weight:900;color:rgba(15,23,42,.05);transform:rotate(-25deg);z-index:0;pointer-events:none;}
  .content{position:relative;z-index:1;min-width:0;max-width:100%;}
  .header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #8d39e4;padding-bottom:14px;}
  .company{min-width:0}.company h1{margin:0;font-size:${isThermal ? '15px' : '28px'};font-weight:900;}
  .muted{color:#64748b;}.tiny{font-size:${isThermal ? '8px' : '11px'};}
  .invoice-title{text-align:right;flex:0 0 auto}.invoice-title h2{margin:0;font-size:${isThermal ? '14px' : '22px'};font-weight:900;}
  .pill{display:inline-block;border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;margin-top:6px;}
  .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:16px;}
  .box{min-width:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;overflow-wrap:anywhere;}
  .box h3{margin:0 0 6px;font-size:13px;font-weight:900;}
  table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;margin-top:16px;}
  th{background:#0f172a;color:white;text-align:left;padding:9px;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  td{border-bottom:1px solid #e2e8f0;padding:9px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;}
  th:nth-child(1){width:38%}th:nth-child(2){width:19%}th:nth-child(3){width:7%}th:nth-child(4){width:12%}th:nth-child(5){width:12%}th:nth-child(6){width:12%}
  .right{text-align:right}.center{text-align:center}.bold{font-weight:900;}
  .bottom{display:grid;grid-template-columns:minmax(0,1fr) minmax(210px,32%);gap:14px;margin-top:16px;align-items:start;}
  .verify-row{display:grid;grid-template-columns:minmax(0,1fr) 116px;gap:10px;margin-top:14px;align-items:start;}
  .verify-card{min-width:0;border:1px solid #e2e8f0;border-radius:10px;padding:9px;background:#fff;overflow:hidden;}
  .verify-card svg{display:block;width:100%;max-width:100%;}
  .verify-card img{display:block;max-width:100%;height:auto;}
  .totals{min-width:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;}
  .row{display:flex;justify-content:space-between;gap:12px;padding:4px 0;}.row.big{font-size:16px;font-weight:900;}
  .terms{border-top:1px solid #e2e8f0;margin-top:18px;padding-top:12px;font-size:11px;color:#475569;white-space:pre-wrap;}
  .sign{display:flex;justify-content:space-between;gap:20px;margin-top:42px;font-size:12px;}
  @media print{
    html,body{margin:0!important;padding:0!important;width:auto!important;min-width:0!important;max-width:none!important;min-height:0!important;background:white!important;}
    .page{width:100%!important;min-width:0!important;max-width:none!important;min-height:0!important;margin:0!important;padding:${printPagePadding}!important;overflow:visible!important;}
    .content{width:100%!important;max-width:100%!important;}
    .no-print{display:none!important}
  }
  ${isA5 ? `
    body{font-size:10px}.header{gap:8px;padding-bottom:8px}.company h1{font-size:18px}.invoice-title h2{font-size:16px}.grid{gap:6px;margin-top:9px}.box{padding:7px;border-radius:8px}.box h3{font-size:11px}table{margin-top:9px}th,td{padding:5px;font-size:8.6px}.bottom{grid-template-columns:minmax(0,1fr) minmax(145px,34%);gap:7px;margin-top:9px}.totals{padding:7px;border-radius:8px}.row{padding:2px 0;gap:6px}.row.big{font-size:12px}.verify-row{grid-template-columns:minmax(0,1fr) 88px;gap:6px;margin-top:8px}.verify-card{padding:6px}.terms{margin-top:9px;padding-top:7px;font-size:8px}.sign{margin-top:18px;font-size:9px}
  ` : ''}
  ${!isThermal && geometry.orientation === 'portrait' ? `
    .header{gap:10px}.bottom{grid-template-columns:minmax(0,1fr) minmax(155px,34%)}.verify-row{grid-template-columns:minmax(0,1fr) minmax(82px,25%)}
  ` : ''}
  ${isThermal ? `
    .header{display:block;text-align:center}.invoice-title{text-align:center;margin-top:8px}.grid{display:block}.box{border:0;background:white;padding:4px 0}.bottom{display:block}.totals{border:0;background:white;padding:4px 0}th,td{padding:4px 2px;font-size:9px}.public-link,.warranty-col{display:none}.sign{margin-top:20px}
  ` : ''}
</style>
</head>
<body>
  <div class="page ${layoutClass}">
    <div class="watermark">${esc(design.watermark_text || 'New Singapur Telecom')}</div>
    <div class="content">
      ${show.header ? `<div class="header">
        <div class="company">
          ${company.logo_url ? `<img src="${escAttr(company.logo_url)}" style="max-height:56px;max-width:180px;object-fit:contain;margin-bottom:8px;" />` : ''}
          <h1>${esc(company.name || 'New Singapur Telecom')}</h1>
          <div class="muted">${esc(company.address || '')}</div>
          <div class="muted">${esc(company.phone || '')}${company.email ? ' • ' + esc(company.email) : ''}</div>
          ${company.website ? `<div class="muted">${esc(company.website)}</div>` : ''}
          ${company.vat_bin ? `<div class="muted">BIN/VAT: ${esc(company.vat_bin)}</div>` : ''}
        </div>
        <div class="invoice-title">
          <h2>INVOICE</h2>
          <div class="bold">${esc(inv.invoice_no || '')}</div>
          <div class="muted">${esc(inv.date || '')}</div>
          <span class="pill">${esc(inv.status || '')} / ${esc(inv.payment_status || '')}</span>
        </div>
      </div>` : ''}

      ${show.customer ? `<div class="grid">
        <div class="box"><h3>Bill To</h3><div>Name: <b>${esc(data.customer?.name || 'Walk-in')}</b></div><div>Phone: <b>${esc(data.customer?.phone || '-')}</b></div><div>Email: <b>${esc(data.customer?.email || '-')}</b></div></div>
        <div class="box"><h3>Branch & Staff</h3><div>Branch: <b>${esc(data.branch?.name || '-')}</b></div><div>Sold By: <b>${esc(data.staff?.sold_by || '-')}</b></div><div>Receiver: <b>${esc(data.staff?.payment_received_by || '-')}</b></div></div>
      </div>` : ''}

      ${show.items ? `<table>
        <thead><tr><th>Product</th><th>IMEI</th><th>Qty</th><th class="right">Rate</th><th class="right">Total</th><th class="warranty-col">Warranty</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : ''}

      ${(show.totals || show.onlineCopy || show.verificationBarcode) ? `<div class="bottom">
        <div>
          ${show.totals ? `<div><b>Amount in Words:</b></div><div>${esc(inv.amount_in_words || '')}</div>` : ''}
          ${(show.verificationBarcode || show.onlineCopy) ? `<div class="verify-row">
            ${show.verificationBarcode ? `<div class="verify-card"><b>Sales Record</b><div style="height:52px;max-width:330px;margin-top:6px">${barcodeSvg(inv.invoice_no || '')}</div><div class="bold tiny">${esc(inv.invoice_no || '')}</div></div>` : ''}
            ${show.onlineCopy ? `<div class="verify-card"><b>Scan to Verify</b>${qrDataUrl ? `<img src="${escAttr(qrDataUrl)}" style="width:92px;height:92px;margin-top:6px"/>` : ''}</div>` : ''}
          </div>` : ''}
        </div>
        ${show.totals ? `<div class="totals">
          ${totalRow('Subtotal', inv.subtotal, currency)}
          ${totalRow('Discount', (Number(inv.discount) || 0) + (Number(inv.coupon_discount) || 0), currency)}
          ${totalRow('Delivery', inv.delivery_charge, currency)}
          ${totalRow('Final Amount', inv.final_amount, currency, true)}
          ${totalRow('Paid', inv.paid_amount, currency)}
          ${totalRow('Due', inv.due_amount, currency, true)}
        </div>` : ''}
      </div>` : ''}

      ${show.terms ? `<div class="terms"><b>Terms & Conditions:</b><br>${esc(design.terms || '')}</div>` : ''}
      ${show.signatures ? `<div class="sign"><span>Customer Signature</span><span>${esc(design.signature_label || 'Authorized Signature')}</span></div>` : ''}
    </div>
  </div>
</body>
</html>`;
}


const CODE128_PATTERNS = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];

function barcodeSvg(value, height = 46) {
  const text = String(value || '').trim().replace(/[^\x20-\x7E]/g, '').slice(0, 80);
  if (!text) return '';
  const codes = [104, ...[...text].map((character) => Math.max(0, Math.min(95, character.charCodeAt(0) - 32)))];
  let checksum = 104;
  for (let index = 1; index < codes.length; index += 1) checksum += codes[index] * index;
  codes.push(checksum % 103, 106);
  let x = 0;
  const rects = [];
  codes.forEach((code) => {
    const pattern = CODE128_PATTERNS[code] || '';
    [...pattern].forEach((digit, index) => {
      const width = Number(digit);
      if (index % 2 === 0 && width > 0) rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}"/>`);
      x += width;
    });
  });
  return `<svg viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" role="img" aria-label="Invoice ${escAttr(text)}"><g fill="#000">${rects.join('')}</g></svg>`;
}

function totalRow(label, value, currency, big = false) {
  return `<div class="row ${big ? 'big' : ''}"><span>${esc(label)}</span><span>${esc(currency)}${esc(formatMoney(value))}</span></div>`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[ch]));
}

function escAttr(value) {
  return esc(value).replace(/`/g, '&#096;');
}
