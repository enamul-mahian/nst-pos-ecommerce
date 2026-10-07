import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import accountsService from '../../services/accountsService';
import ReportExportPanel from '../../components/reports/ReportExportPanel';
import { NstPageHeader, NstHeaderField, NstButton } from '../../components/ui';
import { Landmark, RefreshCw } from 'lucide-react';
import { useT } from '../../i18n';
import { localDateString } from '../../utils/localDate';

const BDT = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  maximumFractionDigits: 0,
});

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'cashbook', label: 'Cashbook' },
  { key: 'due', label: 'Due Center' },
];

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

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB');
}

function Card({ title, value, subtitle, tone = 'normal' }) {
  const toneClass = {
    normal: 'bg-white text-[var(--nst-dashboard-text)]',
    success: 'bg-white text-[var(--nst-dashboard-text)]', // A1: one calm card style for every KPI
    warning: 'bg-white text-[var(--nst-dashboard-text)]', // A1: one calm card style for every KPI
    danger: 'bg-white text-[var(--nst-dashboard-text)]', // A1: one calm card style for every KPI
    purple: 'bg-white text-[var(--nst-dashboard-text)]', // A1: one calm card style for every KPI
    blue: 'bg-white text-[var(--nst-dashboard-text)]', // A1: one calm card style for every KPI
  }[tone];

  return (
    <div className={`rounded-2xl border border-slate-100 p-4 shadow-sm md:p-5 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--nst-dashboard-muted)]">{title}</p>
      <h3 className="mt-2 text-2xl font-extrabold md:text-3xl">{value}</h3>
      {subtitle && <p className="mt-2 text-xs opacity-70">{subtitle}</p>}
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">{text}</div>;
}

function Table({ columns, rows, emptyText }) {
  if (!rows?.length) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`whitespace-nowrap px-4 py-3 font-bold ${column.align === 'right' ? 'text-right' : ''}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => (
            <tr key={row.id || row.raw_id || row.supplier_id || row.customer_id || row.date || index} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td key={column.key} className={`whitespace-nowrap px-4 py-3 text-slate-700 ${column.align === 'right' ? 'text-right' : ''}`}>
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

function Section({ title, subtitle, action, children }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-[var(--nst-dashboard-text)]">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AccountsDashboard() {
  const t = useT();
  const [activeTab, setActiveTab] = useState('overview');
  const [dateFrom, setDateFrom] = useState(monthStartDate());
  const [dateTo, setDateTo] = useState(todayDate());
  const [summary, setSummary] = useState(null);
  const [purchases, setPurchases] = useState(null);
  const [sales, setSales] = useState(null);
  const [customerDue, setCustomerDue] = useState(null);
  const [supplierDue, setSupplierDue] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [cashbook, setCashbook] = useState(null);
  const [dueCenter, setDueCenter] = useState(null);
  const [accountsUsers, setAccountsUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const params = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      latest_limit: 8,
      limit: 200,
    }),
    [dateFrom, dateTo]
  );

  const loadAccounts = async () => {
    try {
      setLoading(true);
      setError('');

      const [summaryRes, salesRes, purchaseRes, customerDueRes, supplierDueRes, expenseRes, cashbookRes, dueCenterRes] = await Promise.all([
        api.get('/reports/summary', { params }),
        api.get('/reports/sales', { params }),
        api.get('/reports/purchases', { params }),
        api.get('/reports/customer-due', { params }),
        api.get('/reports/supplier-due', { params }),
        api.get('/reports/expenses', { params }),
        accountsService.getCashbook(params),
        accountsService.getDueCenter(params),
      ]);

      setSummary(unwrap(summaryRes));
      setSales(unwrap(salesRes));
      setPurchases(unwrap(purchaseRes));
      setCustomerDue(unwrap(customerDueRes));
      setSupplierDue(unwrap(supplierDueRes));
      setExpenses(unwrap(expenseRes));
      setCashbook(unwrap(cashbookRes));
      setDueCenter(unwrap(dueCenterRes));

      try {
        const accountsRes = await api.get('/users', {
          params: {
            profile_type: 'accounts',
            per_page: 20,
          },
        });

        const usersPayload = unwrap(accountsRes);
        setAccountsUsers(usersPayload?.data || usersPayload || []);
      } catch (userErr) {
        console.warn('Accounts user list skipped:', userErr);
        setAccountsUsers([]);
      }
    } catch (err) {
      console.error('Accounts dashboard load failed:', err);
      setError(err?.response?.data?.message || err?.message || t('accounts.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, [params]);

  const profitLoss = summary?.profit_loss || {};
  const salesSummary = sales?.summary || summary?.sales || {};
  const purchaseSummary = purchases?.summary || summary?.purchases || {};
  const customerDueSummary = dueCenter?.summary || customerDue?.summary || summary?.customer_due || {};
  const supplierDueSummary = dueCenter?.summary || supplierDue?.summary || summary?.supplier_due || {};
  const expenseSummary = expenses?.summary || summary?.expenses || {};
  const cashbookSummary = cashbook?.summary || {};

  return (
    <div className="p-4 md:p-6">
      <NstPageHeader
        variant="filters"
        icon={Landmark}
        title="Accounts Dashboard"
        subtitle={t('accounts.subtitle')}
        filters={<>
          <NstHeaderField label="From"><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)}/></NstHeaderField>
          <NstHeaderField label="To"><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)}/></NstHeaderField>
        </>}
        actions={<>
          <NstButton as={Link} to="/customer-due-collection">Receive Due</NstButton>
          <NstButton as={Link} to="/supplier-payments">Pay Supplier</NstButton>
          <NstButton as={Link} to="/expenses">Add Expense</NstButton>
          <NstButton variant="primary" icon={RefreshCw} onClick={loadAccounts} loading={loading}>{loading ? 'Loading...' : 'Refresh'}</NstButton>
        </>}
      />

      <div className="mb-5">
        <ReportExportPanel dateFrom={dateFrom} dateTo={dateTo} defaultReportType="cashbook" compact />
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${activeTab === tab.key ? 'bg-[var(--nst-dashboard-primary)] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Net Profit" value={money(profitLoss.net_profit)} subtitle="Gross profit - expenses" tone="purple" />
            <Card title="Cash In" value={money(cashbookSummary.cash_in || salesSummary.total_paid_amount)} subtitle="Sale + due collection" tone="success" />
            <Card title="Cash Out" value={money(cashbookSummary.cash_out)} subtitle="Supplier payment + expenses" tone="danger" />
            <Card title="Net Cash" value={money(cashbookSummary.net_cash)} subtitle="Cash in - cash out" tone="blue" />
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Customer Due" value={money(customerDueSummary.customer_due_total || customerDueSummary.total_due_amount || salesSummary.total_due_amount)} subtitle={`${number(customerDueSummary.customer_count)} customers`} tone="warning" />
            <Card title="Supplier Due" value={money(supplierDueSummary.supplier_due_total || supplierDueSummary.total_due_amount || purchaseSummary.due_amount)} subtitle={`${number(supplierDueSummary.supplier_count)} suppliers`} tone="danger" />
            <Card title="Purchase Amount" value={money(purchaseSummary.total_purchase_amount)} subtitle={`Paid: ${money(purchaseSummary.paid_amount)}`} />
            <Card title="Expense" value={money(expenseSummary.total_expense)} subtitle={`Entries: ${number(expenseSummary.expense_count)}`} />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Section
              title="Latest Cashbook Transactions"
              subtitle="Cash in/out recent history."
              action={<button type="button" onClick={() => setActiveTab('cashbook')} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">Open Cashbook</button>}
            >
              <Table
                rows={(cashbook?.transactions || []).slice(0, 8)}
                emptyText={t('accounts.empty.cashbook_transactions')}
                columns={[
                  { key: 'date', label: 'Date', render: (row) => formatDate(row.date) },
                  { key: 'source', label: 'Source' },
                  { key: 'party_name', label: 'Party' },
                  { key: 'amount', label: 'Amount', align: 'right', render: (row) => <span className={row.direction === 'in' ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>{row.direction === 'in' ? '+' : '-'} {money(row.amount)}</span> },
                ]}
              />
            </Section>

            <Section
              title="Accounts Users"
              subtitle="Accounts role user list."
            >
              <Table
                rows={accountsUsers}
                emptyText={t('accounts.empty.accounts_users')}
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'status', label: 'Status' },
                ]}
              />
            </Section>
          </div>
        </>
      )}

      {activeTab === 'cashbook' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card title="Cash In" value={money(cashbookSummary.cash_in)} subtitle="Sale collection" tone="success" />
            <Card title="Cash Out" value={money(cashbookSummary.cash_out)} subtitle="Supplier + expense" tone="danger" />
            <Card title="Net Cash" value={money(cashbookSummary.net_cash)} subtitle={`Transactions: ${number(cashbookSummary.transaction_count)}`} tone="blue" />
          </div>

          <Section title="Payment Method Summary" subtitle="Cash, bKash, bank/card wise cash in/out.">
            <Table
              rows={cashbook?.by_payment_method || []}
              emptyText={t('accounts.empty.payment_methods')}
              columns={[
                { key: 'payment_method', label: 'Method' },
                { key: 'cash_in', label: 'Cash In', align: 'right', render: (row) => money(row.cash_in) },
                { key: 'cash_out', label: 'Cash Out', align: 'right', render: (row) => money(row.cash_out) },
                { key: 'net_cash', label: 'Net', align: 'right', render: (row) => money(row.net_cash) },
              ]}
            />
          </Section>

          <Section title="Cashbook Transactions" subtitle={t('accounts.cashbook_transactions_subtitle')}>
            <Table
              rows={cashbook?.transactions || []}
              emptyText={t('accounts.empty.cashbook_transactions')}
              columns={[
                { key: 'date', label: 'Date', render: (row) => formatDate(row.date) },
                { key: 'reference_no', label: 'Ref' },
                { key: 'source', label: 'Source' },
                { key: 'party_name', label: 'Party' },
                { key: 'payment_method', label: 'Method' },
                { key: 'transaction_id', label: 'Trx ID' },
                { key: 'amount', label: 'Amount', align: 'right', render: (row) => <span className={row.direction === 'in' ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>{row.direction === 'in' ? '+' : '-'} {money(row.amount)}</span> },
              ]}
            />
          </Section>
        </div>
      )}

      {activeTab === 'due' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card title="Customer Receivable" value={money(customerDueSummary.customer_due_total)} subtitle={`${number(customerDueSummary.customer_count)} customers`} tone="warning" />
            <Card title="Supplier Payable" value={money(customerDueSummary.supplier_due_total)} subtitle={`${number(customerDueSummary.supplier_count)} suppliers`} tone="danger" />
            <Card title="Net Position" value={money(customerDueSummary.net_receivable_minus_payable)} subtitle="Receivable - payable" tone="blue" />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Section title="Customer Due Collection" subtitle={t('accounts.customer_due_subtitle')}>
              <Table
                rows={dueCenter?.customers || []}
                emptyText={t('accounts.empty.customer_due')}
                columns={[
                  { key: 'name', label: 'Customer' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'due_amount', label: 'Due', align: 'right', render: (row) => money(row.due_amount) },
                  { key: 'action', label: 'Action', align: 'right', render: (row) => <Link to={`/customers/${row.id}/ledger`} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">Receive</Link> },
                ]}
              />
            </Section>

            <Section title="Supplier Payment" subtitle={t('accounts.supplier_payment_subtitle')}>
              <Table
                rows={dueCenter?.suppliers || []}
                emptyText={t('accounts.empty.supplier_due')}
                columns={[
                  { key: 'name', label: 'Supplier' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'due_amount', label: 'Due', align: 'right', render: (row) => money(row.due_amount) },
                  { key: 'action', label: 'Action', align: 'right', render: (row) => <Link to={`/suppliers/${row.id}/ledger`} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100">Pay</Link> },
                ]}
              />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
