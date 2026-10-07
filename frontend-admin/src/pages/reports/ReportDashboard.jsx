import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import ReportExportPanel from '../../components/reports/ReportExportPanel';
import { useNstCardDesign, useNstPageContent, useNstPageLayout } from '../../context/NstSystemUiContext';
import { localDateString } from '../../utils/localDate';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { FileSpreadsheet as NstHdrFileSpreadsheet } from 'lucide-react';
import { useT } from '../../i18n';

const BDT = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  maximumFractionDigits: 0,
});

function todayDate() {
  return localDateString();
}

function monthStartDate() {
  const now = new Date();
  return localDateString(new Date(now.getFullYear(), now.getMonth(), 1));
}

function unwrap(response) {
  return response?.data?.data || response?.data || {};
}

function money(value) {
  return BDT.format(Number(value || 0));
}

function number(value) {
  return Number(value || 0).toLocaleString('en-BD');
}

function ExtraLines({ fields = [] }) {
  if (!fields.length) return null;
  return <div className="nst-report-extra-lines">{fields.map((field, index) => {
    const key = field.id || `${field.type || 'text'}-${index}`;
    if (field.type === 'link' && field.href) return <a key={key} href={field.href}>{field.text}</a>;
    if (field.type === 'badge') return <span key={key} className="is-badge">{field.text}</span>;
    if (field.type === 'note') return <small key={key}>{field.text}</small>;
    return <p key={key}>{field.text}</p>;
  })}</div>;
}

function Card({ cardId, title, value, subtitle }) {
  const design = useNstCardDesign('/reports', cardId, { title, subtitle, minHeight: 0, hoverLift: 2 });
  const style = {
    '--nst-local-radius': `${design.radius}px`,
    '--nst-local-padding': `${design.padding}px`,
    '--nst-local-border-width': `${design.borderWidth}px`,
    '--nst-local-hover-lift': `${design.hoverLift}px`,
    minHeight: design.minHeight > 0 ? `${design.minHeight}px` : undefined,
  };
  return (
    <div className="nst-report-editable-card" style={style} data-nst-card-id={cardId}>
      <p className="nst-report-card-title">{design.title}</p>
      <h3>{value}</h3>
      {design.subtitle && <p className="nst-report-card-subtitle">{design.subtitle}</p>}
      <ExtraLines fields={design.extraFields} />
    </div>
  );
}

function Section({ cardId, title, children, action }) {
  const design = useNstCardDesign('/reports', cardId, { title, subtitle: '', minHeight: 0, hoverLift: 1 });
  const style = {
    '--nst-local-radius': `${design.radius}px`,
    '--nst-local-padding': `${design.padding}px`,
    '--nst-local-border-width': `${design.borderWidth}px`,
    '--nst-local-hover-lift': `${design.hoverLift}px`,
    minHeight: design.minHeight > 0 ? `${design.minHeight}px` : undefined,
  };
  return (
    <section className="nst-report-editable-card nst-report-editable-section" style={style} data-nst-card-id={cardId}>
      <div className="nst-report-section-head">
        <div><h2>{design.title}</h2>{design.subtitle && <p>{design.subtitle}</p>}<ExtraLines fields={design.extraFields} /></div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text = 'No data found.' }) {
  return <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">{text}</div>;
}

function Table({ columns, rows, emptyText }) {
  if (!rows || rows.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--nst-dashboard-border)]">
      <table className="min-w-full divide-y divide-[var(--nst-dashboard-border)] text-left text-sm">
        <thead className="nst-table-head bg-[var(--nst-dashboard-card-elevated)] text-xs uppercase tracking-wide text-[var(--nst-dashboard-muted)]">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-4 py-3 font-bold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="nst-table-body divide-y divide-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)]">
          {rows.map((row, index) => (
            <tr key={row.id || row.salesman_id || row.supplier_id || row.customer_id || row.date || index} className="nst-table-row">
              {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-4 py-3 text-[var(--nst-dashboard-text)]">
                  {column.render ? column.render(row, index) : row[column.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportDashboard({ defaultTab = 'summary' }) {
  const t = useT();
  const pageContent = useNstPageContent('/reports', { eyebrow: 'New Singapur Telecom', title: 'Business Reports', subtitle: 'Daily sales, monthly salesmen report, purchase, stock, dues and accounts summary.', extraFields: [] });
  const pageLayout = useNstPageLayout('/reports');
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [dateFrom, setDateFrom] = useState(monthStartDate());
  const [dateTo, setDateTo] = useState(todayDate());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({
    summary: null,
    sales: null,
    purchases: null,
    stock: null,
    profitLoss: null,
    branchWise: null,
    customerDue: null,
    supplierDue: null,
    expenses: null,
  });

  const tabs = useMemo(
    () => [
      { key: 'summary', label: 'Summary' },
      { key: 'salesmen', label: 'Salesmen Daily Sales' },
      { key: 'finance', label: 'Accounts / Profit' },
      { key: 'stock', label: 'Stock' },
      { key: 'dues', label: 'Due Reports' },
      { key: 'branches', label: 'Branch Wise' },
    ],
    []
  );

  const params = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
    }),
    [dateFrom, dateTo]
  );

  const loadReports = async () => {
    try {
      setLoading(true);
      setError('');

      const [summaryRes, salesRes, purchasesRes, stockRes, profitRes, branchRes, customerDueRes, supplierDueRes, expenseRes] =
        await Promise.all([
          api.get('/reports/summary', { params }),
          api.get('/reports/sales', { params }),
          api.get('/reports/purchases', { params }),
          api.get('/reports/stock', { params }),
          api.get('/reports/profit-loss', { params }),
          api.get('/reports/branch-wise', { params }),
          api.get('/reports/customer-due', { params }),
          api.get('/reports/supplier-due', { params }),
          api.get('/reports/expenses', { params }),
        ]);

      setData({
        summary: unwrap(summaryRes),
        sales: unwrap(salesRes),
        purchases: unwrap(purchasesRes),
        stock: unwrap(stockRes),
        profitLoss: unwrap(profitRes),
        branchWise: unwrap(branchRes),
        customerDue: unwrap(customerDueRes),
        supplierDue: unwrap(supplierDueRes),
        expenses: unwrap(expenseRes),
      });
    } catch (err) {
      console.error('Report API Error:', err);
      setError(err?.response?.data?.message || err?.message || t('reports.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    loadReports();
  }, []);

  const salesSummary = data.sales?.summary || data.summary?.sales || {};
  const purchaseSummary = data.purchases?.summary || data.summary?.purchases || {};
  const stockSummary = data.stock?.summary || data.summary?.stock || {};
  const customerDueSummary = data.customerDue?.summary || data.summary?.customer_due || {};
  const supplierDueSummary = data.supplierDue?.summary || data.summary?.supplier_due || {};
  const profitLoss = data.profitLoss || data.summary?.profit_loss || {};

  const pageStyle = {
    '--nst-report-card-gap': `${pageLayout.cardGap}px`,
    '--nst-report-section-gap': `${pageLayout.sectionGap}px`,
  };

  return (
    <div className="nst-report-page p-4 md:p-6" style={pageStyle}>
      <NstPageHeader icon={NstHdrFileSpreadsheet} title={<>{pageContent.title}</>} subtitle={pageContent.subtitle ? <>{pageContent.subtitle}</> : null} actions={<><div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-bold uppercase text-slate-500">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
            />
          </label>

          <label className="text-xs font-bold uppercase text-slate-500">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
            />
          </label>

          <button
            type="button"
            onClick={loadReports}
            disabled={loading}
            className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60 sm:self-end"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div></>}><ExtraLines fields={pageContent.extraFields} /></NstPageHeader>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${
              activeTab === tab.key
                ? 'bg-[var(--nst-dashboard-secondary)] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-5">
        <ReportExportPanel dateFrom={dateFrom} dateTo={dateTo} defaultReportType="sales" compact />
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading && !error && <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">Report loading...</div>}

      {activeTab === 'summary' && (
        <div className="nst-report-section-stack">
          <div className="nst-report-card-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <Card cardId="summary.sales" title="Sales Amount" value={money(salesSummary.total_sale_amount || salesSummary.sale_amount)} subtitle={`${number(salesSummary.sale_count)} invoices`} />
            <Card cardId="summary.purchase" title="Purchase Amount" value={money(purchaseSummary.total_purchase_amount || purchaseSummary.purchase_amount)} subtitle={`${number(purchaseSummary.purchase_count)} purchases`} />
            <Card cardId="summary.net_profit" title="Net Profit" value={money(profitLoss.net_profit)} subtitle="Gross profit minus expenses" />
            <Card cardId="summary.available_devices" title="Available Devices" value={number(stockSummary.available_devices)} subtitle={`Sold: ${number(stockSummary.sold_devices)}`} />
          </div>

          <div className="nst-report-card-grid grid grid-cols-1 xl:grid-cols-2">
            <Section cardId="summary.daily_sales" title="Daily Sales Trend">
              <Table
                emptyText="No daily sales found."
                rows={data.sales?.daily_trend || []}
                columns={[
                  { key: 'date', label: 'Date' },
                  { key: 'sale_count', label: 'Invoices', render: (row) => number(row.sale_count) },
                  { key: 'sale_amount', label: 'Sales', render: (row) => money(row.sale_amount) },
                  { key: 'profit_amount', label: 'Profit', render: (row) => money(row.profit_amount) },
                ]}
              />
            </Section>

            <Section cardId="summary.latest_sales" title="Latest Sales">
              <Table
                emptyText="No latest sales found."
                rows={data.sales?.latest_sales || []}
                columns={[
                  { key: 'invoice_no', label: 'Invoice' },
                  { key: 'customer_name', label: 'Customer' },
                  { key: 'sold_by_name', label: 'Salesman' },
                  { key: 'final_amount', label: 'Amount', render: (row) => money(row.final_amount || row.total) },
                ]}
              />
            </Section>
          </div>
        </div>
      )}

      {activeTab === 'salesmen' && (
        <div className="nst-report-section-stack">
          <div className="nst-report-card-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <Card cardId="salesmen.monthly_sales" title="Monthly Sales" value={money(salesSummary.total_sale_amount || salesSummary.sale_amount)} subtitle="This report starts from 1st day of selected month" />
            <Card cardId="salesmen.total_invoices" title="Total Invoices" value={number(salesSummary.sale_count)} subtitle="Sales count" />
            <Card cardId="salesmen.sales_profit" title="Sales Profit" value={money(salesSummary.total_profit_amount || salesSummary.profit_amount)} subtitle="By current period" />
            <Card cardId="salesmen.total_due" title="Total Due" value={money(salesSummary.total_due_amount || salesSummary.due_amount)} subtitle="Sales due" />
          </div>

          <Section cardId="salesmen.performance" title="Salesmen Performance">
            <Table
              emptyText="No salesman sales found."
              rows={data.sales?.by_salesman || []}
              columns={[
                { key: 'salesman_name', label: 'Salesman' },
                { key: 'sale_count', label: 'Invoices', render: (row) => number(row.sale_count) },
                { key: 'sale_amount', label: 'Sales', render: (row) => money(row.sale_amount) },
                { key: 'paid_amount', label: 'Paid', render: (row) => money(row.paid_amount) },
                { key: 'due_amount', label: 'Due', render: (row) => money(row.due_amount) },
                { key: 'profit_amount', label: 'Profit', render: (row) => money(row.profit_amount) },
              ]}
            />
          </Section>

          <Section cardId="salesmen.daily_breakdown" title="Daily Sales Breakdown">
            <Table
              emptyText="No daily sales data found."
              rows={data.sales?.daily_trend || []}
              columns={[
                { key: 'date', label: 'Date' },
                { key: 'sale_count', label: 'Invoices', render: (row) => number(row.sale_count) },
                { key: 'sale_amount', label: 'Sales', render: (row) => money(row.sale_amount) },
                { key: 'profit_amount', label: 'Profit', render: (row) => money(row.profit_amount) },
              ]}
            />
          </Section>
        </div>
      )}

      {activeTab === 'finance' && (
        <div className="nst-report-section-stack">
          <div className="nst-report-card-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <Card cardId="finance.gross_profit" title="Gross Profit" value={money(profitLoss.gross_profit)} subtitle="Before expenses" />
            <Card cardId="finance.expenses" title="Expenses" value={money(profitLoss.expense_amount || data.expenses?.summary?.total_expense)} subtitle="Selected period" />
            <Card cardId="finance.net_profit" title="Net Profit" value={money(profitLoss.net_profit)} subtitle="Final accounts view" />
            <Card cardId="finance.supplier_due" title="Supplier Due" value={money(supplierDueSummary.total_supplier_due)} subtitle={`Advance: ${money(supplierDueSummary.total_supplier_advance)}`} />
          </div>

          <div className="nst-report-card-grid grid grid-cols-1 xl:grid-cols-2">
            <Section cardId="finance.payment_method" title="Payment Method Summary">
              <Table
                emptyText="No payment data found."
                rows={data.sales?.by_payment_method || []}
                columns={[
                  { key: 'payment_method', label: 'Method' },
                  { key: 'sale_count', label: 'Invoices', render: (row) => number(row.sale_count) },
                  { key: 'sale_amount', label: 'Amount', render: (row) => money(row.sale_amount) },
                ]}
              />
            </Section>

            <Section cardId="finance.expense_category" title="Expense Category Summary">
              <Table
                emptyText="No expenses found."
                rows={data.expenses?.by_category || []}
                columns={[
                  { key: 'category', label: 'Category' },
                  { key: 'expense_count', label: 'Count', render: (row) => number(row.expense_count) },
                  { key: 'total_expense', label: 'Amount', render: (row) => money(row.total_expense) },
                ]}
              />
            </Section>
          </div>
        </div>
      )}

      {activeTab === 'stock' && (
        <div className="nst-report-section-stack">
          <div className="nst-report-card-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <Card cardId="stock.total_qty" title="Total Stock Qty" value={number(stockSummary.total_branch_stock_qty)} subtitle="Branch stock quantity" />
            <Card cardId="stock.available_devices" title="Available Devices" value={number(stockSummary.available_devices)} subtitle="Device units available" />
            <Card cardId="stock.low_stock" title="Low Stock" value={number(stockSummary.low_stock_count)} subtitle="Qty 1 to 5" />
            <Card cardId="stock.out_of_stock" title="Out of Stock" value={number(stockSummary.out_of_stock_count)} subtitle="Qty 0 or less" />
          </div>

          <div className="nst-report-card-grid grid grid-cols-1 xl:grid-cols-2">
            <Section cardId="stock.branch_stock" title="Branch Stock">
              <Table
                emptyText="No stock data found."
                rows={data.stock?.branch_stock || []}
                columns={[
                  { key: 'branch_name', label: 'Branch' },
                  { key: 'product_name', label: 'Product' },
                  { key: 'product_sku', label: 'SKU' },
                  { key: 'stock_quantity', label: 'Qty', render: (row) => number(row.stock_quantity) },
                ]}
              />
            </Section>

            <Section cardId="stock.device_status" title="Device Status">
              <Table
                emptyText="No device status found."
                rows={data.stock?.device_status || []}
                columns={[
                  { key: 'status', label: 'Status' },
                  { key: 'total_devices', label: 'Devices', render: (row) => number(row.total_devices) },
                ]}
              />
            </Section>
          </div>
        </div>
      )}

      {activeTab === 'dues' && (
        <div className="nst-report-section-stack">
          <div className="nst-report-card-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <Card cardId="dues.customer_due" title="Customer Due" value={money(customerDueSummary.total_customer_due)} subtitle={`${number(customerDueSummary.customer_due_count)} customers`} />
            <Card cardId="dues.supplier_due" title="Supplier Due" value={money(supplierDueSummary.total_supplier_due)} subtitle={`${number(supplierDueSummary.supplier_due_count)} suppliers`} />
            <Card cardId="dues.supplier_advance" title="Supplier Advance" value={money(supplierDueSummary.total_supplier_advance)} subtitle="Advance balance" />
            <Card cardId="dues.sales_due" title="Sales Due" value={money(salesSummary.total_due_amount || salesSummary.due_amount)} subtitle="Selected period" />
          </div>

          <div className="nst-report-card-grid grid grid-cols-1 xl:grid-cols-2">
            <Section cardId="dues.top_customer" title="Top Customer Dues">
              <Table
                emptyText="No customer due found."
                rows={data.customerDue?.customers?.data || []}
                columns={[
                  { key: 'name', label: 'Customer' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'due_amount', label: 'Due', render: (row) => money(row.due_amount || row.current_balance) },
                ]}
              />
            </Section>

            <Section cardId="dues.top_supplier" title="Top Supplier Dues">
              <Table
                emptyText="No supplier due found."
                rows={data.supplierDue?.suppliers?.data || []}
                columns={[
                  { key: 'name', label: 'Supplier' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'due_amount', label: 'Due', render: (row) => money(row.due_amount || row.current_balance) },
                  { key: 'advance_amount', label: 'Advance', render: (row) => money(row.advance_amount || row.advance_balance) },
                ]}
              />
            </Section>
          </div>
        </div>
      )}

      {activeTab === 'branches' && (
        <Section cardId="branches.summary" title="Branch Wise Business Summary">
          <Table
            emptyText="No branch report found."
            rows={data.branchWise?.branches || []}
            columns={[
              { key: 'name', label: 'Branch' },
              { key: 'code', label: 'Code' },
              { key: 'sale_count', label: 'Sales', render: (row) => number(row.sale_count) },
              { key: 'sale_amount', label: 'Sales Amount', render: (row) => money(row.sale_amount) },
              { key: 'purchase_count', label: 'Purchases', render: (row) => number(row.purchase_count) },
              { key: 'purchase_amount', label: 'Purchase Amount', render: (row) => money(row.purchase_amount) },
              { key: 'stock_quantity', label: 'Stock Qty', render: (row) => number(row.stock_quantity) },
              { key: 'profit_amount', label: 'Profit', render: (row) => money(row.profit_amount) },
            ]}
          />
        </Section>
      )}
    </div>
  );
}
