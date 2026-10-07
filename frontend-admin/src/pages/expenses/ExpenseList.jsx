import { useEffect, useMemo, useState } from 'react';
import expenseService from '../../services/expenseService';
import branchService from '../../services/branchService';
import { localDateString } from '../../utils/localDate';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Wallet as NstHdrWallet } from 'lucide-react';
import { useT } from '../../i18n';

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'upay', label: 'Upay' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
  { value: 'other_mfs', label: 'Other MFS' },
];

const categories = [
  'Office Rent',
  'Salary',
  'Internet Bill',
  'Electricity Bill',
  'Courier',
  'Transport',
  'Marketing',
  'Repair & Maintenance',
  'Tea/Snacks',
  'Other',
];

const emptyForm = {
  branch_id: '',
  title: '',
  category: 'Other',
  amount: '',
  payment_method: 'cash',
  provider_name: '',
  transaction_id: '',
  expense_date: localDateString(),
  note: '',
};

function money(value) {
  return `BDT ${Number(value || 0).toLocaleString('en-BD')}`;
}

function getPayload(response) {
  if (response?.success !== undefined || response?.summary !== undefined || Array.isArray(response?.data)) {
    return response;
  }

  return response?.data || response || {};
}

function inputClass() {
  return 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]';
}

function labelClass() {
  return 'text-xs font-bold uppercase tracking-wide text-slate-500';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
}

export default function ExpenseList() {
  const t = useT();
  const [expenses, setExpenses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [summary, setSummary] = useState({ expense_count: 0, total_expense: 0 });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    branch_id: '',
    category: '',
    payment_method: '',
    date_from: localDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    date_to: localDateString(),
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const params = useMemo(() => ({ ...filters, per_page: 100 }), [filters]);

  const getErrorMessage = (err, fallback = 'Something went wrong.') => {
    if (err?.response?.data?.errors) {
      return Object.values(err.response.data.errors).flat().join(' ');
    }

    return err?.response?.data?.message || err?.message || fallback;
  };

  const loadBranches = async () => {
    try {
      const response = await branchService.getBranches({ per_page: 200 });
      const payload = getPayload(response);
      setBranches(payload?.data || payload || []);
    } catch (err) {
      console.warn('Branch load skipped:', err);
      setBranches([]);
    }
  };

  const loadExpenses = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await expenseService.getExpenses(params);
      const payload = getPayload(response);

      setExpenses(Array.isArray(payload.data) ? payload.data : []);
      setSummary(payload.summary || { expense_count: 0, total_expense: 0 });
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Expense list load failed.'));
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [params]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((previous) => ({ ...previous, [name]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (Number(form.amount || 0) <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }

    try {
      setSaving(true);
      setMessage('');
      setError('');

      const payload = {
        ...form,
        branch_id: form.branch_id || null,
        amount: Number(form.amount || 0),
        provider_name: form.provider_name || paymentMethods.find((method) => method.value === form.payment_method)?.label || form.payment_method,
      };

      if (editingId) {
        await expenseService.updateExpense(editingId, payload);
        setMessage('Expense updated successfully.');
      } else {
        await expenseService.createExpense(payload);
        setMessage('Expense saved successfully.');
      }

      resetForm();
      await loadExpenses();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Expense save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (expense) => {
    setEditingId(expense.id);
    setForm({
      branch_id: expense.branch_id || '',
      title: expense.title || '',
      category: expense.category || 'Other',
      amount: expense.amount || '',
      payment_method: expense.payment_method || 'cash',
      provider_name: expense.provider_name || '',
      transaction_id: expense.transaction_id || '',
      expense_date: expense.expense_date ? String(expense.expense_date).slice(0, 10) : localDateString(),
      note: expense.note || '',
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (expense) => {
    const confirmed = window.confirm(`Delete expense ${expense.expense_no || expense.title}?`);
    if (!confirmed) return;

    try {
      setMessage('');
      setError('');
      await expenseService.deleteExpense(expense.id);
      setMessage('Expense deleted successfully.');
      await loadExpenses();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Expense delete failed.'));
    }
  };

  return (
    <div className="p-4 md:p-6">
      <NstPageHeader icon={NstHdrWallet} title={<>Expense Entry</>} subtitle={t('expenses.subtitle')} actions={<><div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Filtered Total Expense</p>
          <h2 className="mt-1 text-2xl font-extrabold text-red-700">{money(summary.total_expense)}</h2>
          <p className="text-xs text-slate-500">Entries: {Number(summary.expense_count || 0).toLocaleString('en-BD')}</p>
        </div></>}/>

      {message && <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
        <h2 className="text-lg font-extrabold text-[var(--nst-dashboard-text)]">{editingId ? 'Edit Expense' : 'Add New Expense'}</h2>

        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className={labelClass()}>
            Branch
            <select name="branch_id" value={form.branch_id} onChange={handleFormChange} className={inputClass()}>
              <option value="">All / Head Office</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>

          <label className={labelClass()}>
            Title *
            <input name="title" value={form.title} onChange={handleFormChange} className={inputClass()} placeholder="Example: Office rent" required />
          </label>

          <label className={labelClass()}>
            Category
            <select name="category" value={form.category} onChange={handleFormChange} className={inputClass()}>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label className={labelClass()}>
            Amount *
            <input type="number" name="amount" value={form.amount} onChange={handleFormChange} min="1" step="0.01" className={inputClass()} placeholder="0" required />
          </label>

          <label className={labelClass()}>
            Payment Method
            <select name="payment_method" value={form.payment_method} onChange={handleFormChange} className={inputClass()}>
              {paymentMethods.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
          </label>

          <label className={labelClass()}>
            Provider Name
            <input name="provider_name" value={form.provider_name} onChange={handleFormChange} className={inputClass()} placeholder="Cash / bKash / Bank name" />
          </label>

          <label className={labelClass()}>
            Transaction ID
            <input name="transaction_id" value={form.transaction_id} onChange={handleFormChange} className={inputClass()} placeholder="Optional" />
          </label>

          <label className={labelClass()}>
            Expense Date
            <input type="date" name="expense_date" value={form.expense_date} onChange={handleFormChange} className={inputClass()} />
          </label>

          <label className={`${labelClass()} md:col-span-2 xl:col-span-4`}>
            Note
            <textarea name="note" value={form.note} onChange={handleFormChange} rows="3" className={inputClass()} placeholder="Optional note" />
          </label>

          <div className="flex flex-col gap-3 md:col-span-2 xl:col-span-4 sm:flex-row">
            <button type="submit" disabled={saving} className="rounded-xl bg-[var(--nst-dashboard-primary)] px-6 py-3 text-sm font-bold text-white transition hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60">
              {saving ? 'Saving...' : editingId ? 'Update Expense' : 'Save Expense'}
            </button>

            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-xl bg-slate-100 px-6 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200">
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
        <h2 className="text-lg font-extrabold text-[var(--nst-dashboard-text)]">Filter Expenses</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className={labelClass()}>
            Search
            <input name="search" value={filters.search} onChange={handleFilterChange} className={inputClass()} placeholder="Title / category / trx" />
          </label>

          <label className={labelClass()}>
            Branch
            <select name="branch_id" value={filters.branch_id} onChange={handleFilterChange} className={inputClass()}>
              <option value="">All Branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>

          <label className={labelClass()}>
            Category
            <select name="category" value={filters.category} onChange={handleFilterChange} className={inputClass()}>
              <option value="">All Category</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label className={labelClass()}>
            Method
            <select name="payment_method" value={filters.payment_method} onChange={handleFilterChange} className={inputClass()}>
              <option value="">All Method</option>
              {paymentMethods.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
          </label>

          <label className={labelClass()}>
            From
            <input type="date" name="date_from" value={filters.date_from} onChange={handleFilterChange} className={inputClass()} />
          </label>

          <label className={labelClass()}>
            To
            <input type="date" name="date_to" value={filters.date_to} onChange={handleFilterChange} className={inputClass()} />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 md:px-5">
          <h2 className="text-lg font-extrabold text-[var(--nst-dashboard-text)]">Expense List</h2>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-blue-700">Expenses loading...</div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No expense found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Expense No</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(expense.expense_date || expense.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--nst-dashboard-text)]">{expense.expense_no}</td>
                    <td className="min-w-[220px] px-4 py-3">
                      <p className="font-semibold text-slate-800">{expense.title}</p>
                      {expense.note && <p className="mt-1 text-xs text-slate-500">{expense.note}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{expense.branch?.name || 'Head Office'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{expense.category || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{expense.provider_name || expense.payment_method}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-red-700">{money(expense.amount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button type="button" onClick={() => handleEdit(expense)} className="mr-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">Edit</button>
                      <button type="button" onClick={() => handleDelete(expense)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
