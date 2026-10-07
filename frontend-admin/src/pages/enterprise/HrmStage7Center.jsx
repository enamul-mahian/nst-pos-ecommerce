import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BadgeCheck, Banknote, BarChart3, Building2, CalendarCheck2, CheckCircle2,
  ClipboardCheck, Clock3, Download, Edit3, FileText, Gauge, Loader2, Plus, RefreshCw,
  Save, ShieldCheck, Trash2, UserCog, UserPlus, Users, WalletCards,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import ZktecoAttendancePanel from './components/ZktecoAttendancePanel';
import { localDateString } from '../../utils/localDate';

const MONEY = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 });
const money = (value) => MONEY.format(Number(value || 0));
const unwrap = (response) => response?.data?.data ?? response?.data ?? {};
const today = () => localDateString();
const monthStart = () => { const date = new Date(); return localDateString(new Date(date.getFullYear(), date.getMonth(), 1)); };

const MODULES = {
  '': { key: 'dashboard', label: 'HR Dashboard', path: '/hrm', icon: Gauge },
  'hr-dashboard': { key: 'dashboard', label: 'HR Dashboard', path: '/hrm', icon: Gauge },
  'hr-employees': { key: 'employees', label: 'Employees', path: '/module/hr-employees', icon: Users },
  'hr-departments': { key: 'departments', label: 'Departments', path: '/module/hr-departments', icon: Building2 },
  'hr-designations': { key: 'designations', label: 'Designations', path: '/module/hr-designations', icon: UserCog },
  'hr-attendance': { key: 'attendance', label: 'Attendance', path: '/module/hr-attendance', icon: Clock3 },
  'hr-shifts': { key: 'shifts', label: 'Shift Management', path: '/module/hr-shifts', icon: CalendarCheck2 },
  'hr-leave': { key: 'leave', label: 'Leave Management', path: '/module/hr-leave', icon: ClipboardCheck },
  payroll: { key: 'payroll', label: 'Payroll', path: '/module/payroll', icon: Banknote },
  'salary-structure': { key: 'salary', label: 'Salary Structure', path: '/module/salary-structure', icon: WalletCards },
  payslip: { key: 'payslip', label: 'Payslip', path: '/module/payslip', icon: FileText },
  'hr-commission': { key: 'commission', label: 'Commission & Bonus', path: '/module/hr-commission', icon: WalletCards },
  'hr-loan': { key: 'loans', label: 'Advance & Loan', path: '/module/hr-loan', icon: Banknote },
  'hr-loans': { key: 'loans', label: 'Advance & Loan', path: '/module/hr-loan', icon: Banknote },
  'hr-performance': { key: 'performance', label: 'Performance', path: '/module/hr-performance', icon: BarChart3 },
  'hr-reports': { key: 'reports', label: 'HR Reports', path: '/module/hr-reports', icon: BarChart3 },
};

const STAGE7_WORKFLOW_LABELS = [
  'Employee Lifecycle',
  'Attendance Summary',
  'Leave Balance',
  'Salary Structure',
  'Payroll Run & Approval',
  'Payroll Entry Adjustment',
  'Payslip Publication',
  'HRM Operation History',
];

function Button({ children, busy, tone = 'primary', ...props }) {
  const tones = {
    primary: 'bg-[var(--nst-dashboard-primary)] text-white',
    soft: 'bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_12%,transparent)] text-[var(--nst-dashboard-primary)]',
    danger: 'bg-red-500/10 text-red-500',
    success: 'bg-emerald-500/10 text-emerald-600',
  };
  return <button type="button" {...props} disabled={busy || props.disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone] || tones.primary}`}>{busy ? <Loader2 size={16} className="animate-spin" /> : null}{children}</button>;
}

function Panel({ title, description, action, children }) {
  return <section className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-black text-[var(--nst-dashboard-text)]">{title}</h2>{description && <p className="mt-1 text-sm text-[var(--nst-dashboard-muted)]">{description}</p>}</div>{action}</div>
    {children}
  </section>;
}

function Metric({ label, value, note, icon: Icon = Activity }) {
  return <article className="rounded-3xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-5 shadow-[var(--nst-dashboard-shadow)]">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-[var(--nst-dashboard-muted)]">{label}</p><p className="mt-2 text-2xl font-black text-[var(--nst-dashboard-text)]">{value}</p>{note && <p className="mt-1 text-xs text-[var(--nst-dashboard-muted)]">{note}</p>}</div><span className="rounded-2xl bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_14%,transparent)] p-3 text-[var(--nst-dashboard-primary)]"><Icon size={20} /></span></div>
  </article>;
}

function Input({ label, ...props }) {
  return <label className="text-xs font-black uppercase tracking-wide text-[var(--nst-dashboard-muted)]">{label}<input {...props} className="mt-1.5 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-3 py-2.5 text-sm text-[var(--nst-dashboard-text)] outline-none focus:border-[var(--nst-dashboard-primary)]" /></label>;
}

function Select({ label, children, ...props }) {
  return <label className="text-xs font-black uppercase tracking-wide text-[var(--nst-dashboard-muted)]">{label}<select {...props} className="mt-1.5 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-3 py-2.5 text-sm text-[var(--nst-dashboard-text)] outline-none focus:border-[var(--nst-dashboard-primary)]">{children}</select></label>;
}

function Textarea({ label, ...props }) {
  return <label className="text-xs font-black uppercase tracking-wide text-[var(--nst-dashboard-muted)]">{label}<textarea {...props} className="mt-1.5 min-h-24 w-full rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] px-3 py-2.5 text-sm text-[var(--nst-dashboard-text)] outline-none focus:border-[var(--nst-dashboard-primary)]" /></label>;
}

function Table({ columns, rows = [], empty = 'No records found.' }) {
  if (!rows.length) return <div className="rounded-2xl border border-dashed border-[var(--nst-dashboard-border)] p-8 text-center text-sm text-[var(--nst-dashboard-muted)]">{empty}</div>;
  return <div className="overflow-x-auto rounded-2xl border border-[var(--nst-dashboard-border)]"><table className="min-w-full text-left text-sm"><thead className="bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_8%,transparent)] text-xs uppercase text-[var(--nst-dashboard-muted)]"><tr>{columns.map((column) => <th key={column.key} className="whitespace-nowrap px-4 py-3 font-black">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--nst-dashboard-border)]">{rows.map((row, index) => <tr key={row.id ?? `${row.employee_id || 'row'}-${index}`} className="hover:bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_5%,transparent)]">{columns.map((column) => <td key={column.key} className="whitespace-nowrap px-4 py-3 text-[var(--nst-dashboard-text)]">{column.render ? column.render(row) : (row[column.key] ?? '-')}</td>)}</tr>)}</tbody></table></div>;
}

function Status({ value }) {
  const text = String(value || 'unknown');
  const good = ['active', 'approved', 'paid', 'published', 'present', 'settled', 'ready'].includes(text);
  const bad = ['rejected', 'terminated', 'cancelled', 'missing'].includes(text);
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${good ? 'bg-emerald-500/10 text-emerald-600' : bad ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-600'}`}>{text.replaceAll('_', ' ')}</span>;
}

export default function HrmStage7Center({ refreshToken, moduleKey = '' }) {
  const module = MODULES[moduleKey] || MODULES[''];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState({});
  const [reference, setReference] = useState({});
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [leaves, setLeaves] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [salaryStructures, setSalaryStructures] = useState([]);
  const [payrollPeriods, setPayrollPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [periodDetail, setPeriodDetail] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [loans, setLoans] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [audit, setAudit] = useState([]);
  const [acceptance, setAcceptance] = useState({});
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({ date_from: monthStart(), date_to: today() });
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [referenceForm, setReferenceForm] = useState({ id: null, name: '', code: '', branch_id: '', department_id: '', grade: 1, starts_at: '10:00', ends_at: '20:00', grace_minutes: 15, annual_days: 10, is_active: true });
  const [employeeForm, setEmployeeForm] = useState({ name: '', employee_no: '', phone: '', email: '', employment_type: 'full_time', joining_date: today(), status: 'active', branch_id: '', department_id: '', designation_id: '', shift_id: '', user_id: '', reporting_manager_id: '', nid_number: '', address: '' });
  const [attendanceForm, setAttendanceForm] = useState({ employee_id: '', attendance_date: today(), check_in: '10:00', check_out: '20:00', late_minutes: 0, overtime_minutes: 0, status: 'present', approved: true, note: '' });
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', leave_type_id: '', starts_on: today(), ends_on: today(), reason: '' });
  const [salaryForm, setSalaryForm] = useState({ employee_id: '', effective_from: today(), basic_salary: '', house_rent: 0, medical: 0, transport: 0, other_earning: 0, provident_fund: 0, other_deduction: 0, tax_amount: 0 });
  const [payrollForm, setPayrollForm] = useState({ name: `Payroll ${today().slice(0, 7)}`, starts_on: monthStart(), ends_on: today(), branch_id: '' });
  const [adjustForm, setAdjustForm] = useState({ entry_id: '', overtime_amount: 0, commission_amount: 0, bonus_amount: 0, loan_recovery: 0, tax_amount: 0, note: '' });
  const [loanForm, setLoanForm] = useState({ employee_id: '', loan_type: 'advance', principal_amount: '', installment_amount: '', starts_on: today(), note: '' });
  const [performanceForm, setPerformanceForm] = useState({ id: null, employee_id: '', review_type: 'performance', review_date: today(), score: '', goals: '', competencies: '', summary: '', outcome: '' });

  const employeeOptions = useMemo(() => employees.map((employee) => ({ id: employee.id, label: `${employee.employee_no || 'EMP'} · ${employee.name}` })), [employees]);
  const summary = overview.summary || {};
  const filteredEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((employee) => [employee.employee_no, employee.name, employee.phone, employee.email, employee.department_name, employee.designation_name].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [employees, search]);

  const setFromResponse = useCallback((key, response) => {
    const data = unwrap(response);
    if (key === 'overview') setOverview(data || {});
    if (key === 'reference') setReference(data || {});
    if (key === 'employees') setEmployees(Array.isArray(data) ? data : []);
    if (key === 'attendance') setAttendance(Array.isArray(data) ? data : []);
    if (key === 'attendanceSummary') setAttendanceSummary(data || {});
    if (key === 'leaves') setLeaves(Array.isArray(data) ? data : []);
    if (key === 'leaveBalances') setLeaveBalances(data?.balances || []);
    if (key === 'salary') setSalaryStructures(Array.isArray(data) ? data : []);
    if (key === 'payroll') setPayrollPeriods(Array.isArray(data) ? data : []);
    if (key === 'loans') setLoans(Array.isArray(data) ? data : []);
    if (key === 'performance') setPerformance(Array.isArray(data) ? data : []);
    if (key === 'audit') setAudit(data?.logs || []);
    if (key === 'acceptance') setAcceptance(data || {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const common = {
      overview: () => api.get('/hrm/overview'),
      reference: () => api.get('/hrm/reference-data'),
      employees: () => api.get('/hrm/employees'),
    };
    const tasksByModule = {
      dashboard: [['overview', common.overview], ['reference', common.reference], ['employees', common.employees], ['attendance', () => api.get('/hrm/attendance', { params: { date_from: today(), date_to: today() } })], ['leaves', () => api.get('/hrm/leaves', { params: { status: 'pending' } })]],
      employees: [['reference', common.reference], ['employees', common.employees]],
      departments: [['reference', common.reference]],
      designations: [['reference', common.reference]],
      shifts: [['reference', common.reference]],
      attendance: [['reference', common.reference], ['employees', common.employees], ['attendance', () => api.get('/hrm/attendance', { params: dateRange })], ['attendanceSummary', () => api.get('/hrm/attendance-summary', { params: dateRange })]],
      leave: [['reference', common.reference], ['employees', common.employees], ['leaves', () => api.get('/hrm/leaves')], ['leaveBalances', () => api.get('/hrm/leave-balances')]],
      salary: [['reference', common.reference], ['employees', common.employees], ['salary', () => api.get('/hrm/salary-structures')]],
      payroll: [['reference', common.reference], ['employees', common.employees], ['payroll', () => api.get('/hrm/payroll')]],
      payslip: [['payroll', () => api.get('/hrm/payroll')]],
      commission: [['payroll', () => api.get('/hrm/payroll')]],
      loans: [['employees', common.employees], ['loans', () => api.get('/hrm/loans')]],
      performance: [['employees', common.employees], ['performance', () => api.get('/hrm/performance')]],
      reports: [['overview', common.overview], ['attendanceSummary', () => api.get('/hrm/attendance-summary', { params: dateRange })], ['leaveBalances', () => api.get('/hrm/leave-balances')], ['payroll', () => api.get('/hrm/payroll')], ['audit', () => api.get('/hrm/audit-history')], ['acceptance', () => api.get('/hrm/acceptance-status')]],
    };
    const tasks = tasksByModule[module.key] || tasksByModule.dashboard;
    try {
      const results = await Promise.allSettled(tasks.map(([, request]) => request()));
      results.forEach((result, index) => { if (result.status === 'fulfilled') setFromResponse(tasks[index][0], result.value); });
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length) toast.error(failures[0]?.reason?.response?.data?.message || `${failures.length} HRM data source could not load.`);
    } finally {
      setLoading(false);
    }
  }, [module.key, dateRange, setFromResponse]);

  useEffect(() => { load(); }, [load, refreshToken]);
  useEffect(() => {
    setReferenceForm({ id: null, name: '', code: '', branch_id: '', department_id: '', grade: 1, starts_at: '10:00', ends_at: '20:00', grace_minutes: 15, annual_days: 10, is_active: true });
    setSelectedPeriod(null);
    setPeriodDetail(null);
    setPayslips([]);
  }, [module.key]);

  const run = async (work, success) => {
    setSaving(true);
    try { await work(); toast.success(success); await load(); }
    catch (error) { toast.error(error?.response?.data?.message || error?.message || 'HRM operation failed.'); }
    finally { setSaving(false); }
  };

  const resetEmployee = () => { setEditingEmployeeId(null); setEmployeeForm({ name: '', employee_no: '', phone: '', email: '', employment_type: 'full_time', joining_date: today(), status: 'active', branch_id: '', department_id: '', designation_id: '', shift_id: '', user_id: '', reporting_manager_id: '', nid_number: '', address: '' }); };
  const editEmployee = (employee) => { setEditingEmployeeId(employee.id); setEmployeeForm({ name: employee.name || '', employee_no: employee.employee_no || '', phone: employee.phone || '', email: employee.email || '', employment_type: employee.employment_type || 'full_time', joining_date: employee.joining_date || today(), status: employee.status || 'active', branch_id: employee.branch_id || '', department_id: employee.department_id || '', designation_id: employee.designation_id || '', shift_id: employee.shift_id || '', user_id: employee.user_id || '', reporting_manager_id: employee.reporting_manager_id || '', nid_number: employee.nid_number || '', address: employee.address || '' }); };
  const saveEmployee = () => run(async () => {
    if (!employeeForm.name.trim()) throw new Error('Employee name is required.');
    const payload = Object.fromEntries(Object.entries(employeeForm).map(([key, value]) => [key, ['branch_id', 'department_id', 'designation_id', 'shift_id', 'user_id', 'reporting_manager_id'].includes(key) ? (value || null) : value]));
    if (editingEmployeeId) await api.put(`/hrm/employees/${editingEmployeeId}`, payload); else await api.post('/hrm/employees', payload);
    resetEmployee();
  }, editingEmployeeId ? 'Employee updated.' : 'Employee created.');

  const referenceType = module.key === 'departments' ? 'department' : module.key === 'designations' ? 'designation' : 'shift';
  const referenceRows = module.key === 'departments' ? (reference.departments || []) : module.key === 'designations' ? (reference.designations || []) : (reference.shifts || []);
  const saveReference = () => run(async () => {
    if (!referenceForm.name.trim() || !referenceForm.code.trim()) throw new Error('Name and code are required.');
    const payload = { name: referenceForm.name, code: referenceForm.code, is_active: referenceForm.is_active };
    if (referenceType === 'department') Object.assign(payload, { branch_id: referenceForm.branch_id || null });
    if (referenceType === 'designation') Object.assign(payload, { department_id: referenceForm.department_id || null, grade: Number(referenceForm.grade || 1) });
    if (referenceType === 'shift') Object.assign(payload, { starts_at: referenceForm.starts_at, ends_at: referenceForm.ends_at, grace_minutes: Number(referenceForm.grace_minutes || 0), weekends: [] });
    if (referenceForm.id) await api.put(`/hrm/reference-data/${referenceType}/${referenceForm.id}`, payload); else await api.post(`/hrm/reference-data/${referenceType}`, payload);
    setReferenceForm({ id: null, name: '', code: '', branch_id: '', department_id: '', grade: 1, starts_at: '10:00', ends_at: '20:00', grace_minutes: 15, annual_days: 10, is_active: true });
  }, referenceForm.id ? 'Reference updated.' : 'Reference created.');
  const editReference = (row) => setReferenceForm({ id: row.id, name: row.name || '', code: row.code || '', branch_id: row.branch_id || '', department_id: row.department_id || '', grade: row.grade || 1, starts_at: String(row.starts_at || '10:00').slice(0, 5), ends_at: String(row.ends_at || '20:00').slice(0, 5), grace_minutes: row.grace_minutes || 0, annual_days: row.annual_days || 10, is_active: Boolean(row.is_active ?? true) });
  const deleteReference = (row) => { if (!window.confirm(`Delete ${row.name}? Existing linked records will block unsafe deletion.`)) return; run(() => api.delete(`/hrm/reference-data/${referenceType}/${row.id}`), 'Reference deleted.'); };

  const saveAttendance = () => run(async () => {
    if (!attendanceForm.employee_id) throw new Error('Employee is required.');
    await api.post('/hrm/attendance', { ...attendanceForm, employee_id: Number(attendanceForm.employee_id), late_minutes: Number(attendanceForm.late_minutes || 0), overtime_minutes: Number(attendanceForm.overtime_minutes || 0), approved: Boolean(attendanceForm.approved) });
  }, 'Attendance saved.');

  const saveLeave = () => run(async () => {
    if (!leaveForm.employee_id || !leaveForm.leave_type_id) throw new Error('Employee and leave type are required.');
    await api.post('/hrm/leaves', { ...leaveForm, employee_id: Number(leaveForm.employee_id), leave_type_id: Number(leaveForm.leave_type_id) });
  }, 'Leave request submitted.');
  const reviewLeave = (leave, status) => run(() => api.post(`/hrm/leaves/${leave.id}/review`, { status }), `Leave ${status}.`);

  const saveSalary = () => run(async () => {
    if (!salaryForm.employee_id || Number(salaryForm.basic_salary) <= 0) throw new Error('Employee and basic salary are required.');
    const earnings = [
      { name: 'House Rent', amount: Number(salaryForm.house_rent || 0) },
      { name: 'Medical', amount: Number(salaryForm.medical || 0) },
      { name: 'Transport', amount: Number(salaryForm.transport || 0) },
      { name: 'Other Earning', amount: Number(salaryForm.other_earning || 0) },
    ].filter((item) => item.amount > 0);
    const deductions = [
      { name: 'Provident Fund', amount: Number(salaryForm.provident_fund || 0) },
      { name: 'Other Deduction', amount: Number(salaryForm.other_deduction || 0) },
    ].filter((item) => item.amount > 0);
    await api.post('/hrm/salary-structures', { employee_id: Number(salaryForm.employee_id), effective_from: salaryForm.effective_from, basic_salary: Number(salaryForm.basic_salary), earnings, deductions, tax_amount: Number(salaryForm.tax_amount || 0), is_active: true });
  }, 'Salary structure saved.');

  const generatePayroll = () => run(() => api.post('/hrm/payroll/generate', { ...payrollForm, branch_id: payrollForm.branch_id || null }), 'Payroll draft generated.');
  const openPeriod = async (period, target = module.key) => {
    setSelectedPeriod(period);
    const response = await api.get(`/hrm/payroll/${period.id}`);
    const detail = unwrap(response);
    setPeriodDetail(detail);
    if (target === 'payslip') {
      const payslipResponse = await api.get(`/hrm/payroll/${period.id}/payslips`);
      const data = unwrap(payslipResponse);
      setPayslips(data?.payslips || data?.entries || (Array.isArray(data) ? data : []));
    }
  };
  const payrollAction = (action) => run(async () => {
    if (!selectedPeriod?.id) throw new Error('Select a payroll period first.');
    const cashBankAccounts = reference.cash_bank_accounts || reference.accounts?.filter((account) => account.is_cash || account.is_bank) || [];
    await api.post(`/hrm/payroll/${selectedPeriod.id}/action`, { action, payment_account_id: action === 'pay' ? cashBankAccounts[0]?.id : undefined, payment_method: 'cash' });
    await openPeriod(selectedPeriod);
  }, `Payroll ${action} completed.`);
  const saveAdjustment = () => run(async () => {
    if (!selectedPeriod?.id || !adjustForm.entry_id) throw new Error('Select a payroll period and employee entry.');
    const response = await api.put(`/hrm/payroll/${selectedPeriod.id}/entries/${adjustForm.entry_id}`, { ...adjustForm, overtime_amount: Number(adjustForm.overtime_amount || 0), commission_amount: Number(adjustForm.commission_amount || 0), bonus_amount: Number(adjustForm.bonus_amount || 0), loan_recovery: Number(adjustForm.loan_recovery || 0), tax_amount: Number(adjustForm.tax_amount || 0) });
    setPeriodDetail(unwrap(response));
  }, 'Payroll entry updated.');
  const publishPayslips = () => run(async () => {
    if (!selectedPeriod?.id) throw new Error('Select a payroll period first.');
    await api.post(`/hrm/payroll/${selectedPeriod.id}/payslips/publish`, { delivery_channel: 'portal' });
    await openPeriod(selectedPeriod, 'payslip');
  }, 'Payslips published.');
  const exportPayroll = async () => {
    try {
      const response = await api.get('/hrm/payroll/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `nst-payroll-${today()}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(error?.response?.data?.message || 'Payroll export failed.'); }
  };

  const saveLoan = () => run(async () => {
    if (!loanForm.employee_id || Number(loanForm.principal_amount) <= 0) throw new Error('Employee and principal amount are required.');
    await api.post('/hrm/loans', { ...loanForm, employee_id: Number(loanForm.employee_id), principal_amount: Number(loanForm.principal_amount), installment_amount: Number(loanForm.installment_amount || 0) });
  }, 'Loan/advance request created.');
  const loanAction = (loan, action) => run(() => api.post(`/hrm/loans/${loan.id}/action`, { action }), `Loan ${action} completed.`);

  const resetPerformance = () => setPerformanceForm({ id: null, employee_id: '', review_type: 'performance', review_date: today(), score: '', goals: '', competencies: '', summary: '', outcome: '' });
  const savePerformance = () => run(async () => {
    if (!performanceForm.employee_id || performanceForm.score === '') throw new Error('Employee and score are required.');
    const payload = { ...performanceForm, employee_id: Number(performanceForm.employee_id), score: Number(performanceForm.score), goals: performanceForm.goals ? performanceForm.goals.split('\n').filter(Boolean) : [], competencies: performanceForm.competencies ? performanceForm.competencies.split('\n').filter(Boolean) : [] };
    if (performanceForm.id) await api.put(`/hrm/performance/${performanceForm.id}`, payload); else await api.post('/hrm/performance', payload);
    resetPerformance();
  }, performanceForm.id ? 'Performance review updated.' : 'Performance review created.');

  const ModuleIcon = module.icon;
  return <div className="nst-hrm-center space-y-4">
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ModuleIcon size={20} /></span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">People & Payroll</p>
          <h2 className="mt-0.5 text-xl font-black text-slate-950">{module.label}</h2>
          <p className="text-xs font-medium text-slate-500">Use the main sidebar to move between HR modules. This page keeps only the active workflow.</p>
        </div>
      </div>
      <Button tone="soft" onClick={load} busy={loading}><RefreshCw size={16} />Refresh</Button>
    </div>
    {loading && <div className="flex items-center gap-2 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-4 text-sm text-[var(--nst-dashboard-muted)]"><Loader2 className="animate-spin" size={16} />Loading {module.label} data…</div>}

    {module.key === 'dashboard' && <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Active Employees" value={summary.active_employees || 0} icon={Users} /><Metric label="Present Today" value={summary.present_today || 0} icon={CalendarCheck2} /><Metric label="Pending Leave" value={summary.pending_leave || 0} icon={ClipboardCheck} /><Metric label="Payroll Due" value={money(summary.payroll_due)} icon={Banknote} /><Metric label="Loan Outstanding" value={money(summary.loan_outstanding)} icon={BadgeCheck} /></div>
      <div className="grid gap-5 xl:grid-cols-2"><Panel title="Today Attendance"><Table rows={overview.attendance_today || attendance} columns={[{ key: 'employee_no', label: 'Employee No' }, { key: 'employee_name', label: 'Employee' }, { key: 'check_in', label: 'In' }, { key: 'check_out', label: 'Out' }, { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }]} /></Panel><Panel title="Pending Leave"><Table rows={overview.pending_leave_requests || leaves} columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'leave_type_name', label: 'Type' }, { key: 'starts_on', label: 'From' }, { key: 'ends_on', label: 'To' }, { key: 'days', label: 'Days' }]} /></Panel></div>
    </div>}

    {module.key === 'employees' && <div className="space-y-5"><div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]"><Panel title={editingEmployeeId ? 'Edit Employee' : 'Add Employee'} description="Branch, department, designation, shift, login and reporting manager are linked to one employee lifecycle record."><div className="grid gap-3 sm:grid-cols-2"><Input label="Employee No (optional)" value={employeeForm.employee_no} onChange={(event) => setEmployeeForm({ ...employeeForm, employee_no: event.target.value })} /><Input label="Name" value={employeeForm.name} onChange={(event) => setEmployeeForm({ ...employeeForm, name: event.target.value })} /><Input label="Phone" value={employeeForm.phone} onChange={(event) => setEmployeeForm({ ...employeeForm, phone: event.target.value })} /><Input label="Email" type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })} /><Select label="Employment Type" value={employeeForm.employment_type} onChange={(event) => setEmployeeForm({ ...employeeForm, employment_type: event.target.value })}>{['full_time', 'part_time', 'contract', 'intern'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select><Input label="Joining Date" type="date" value={employeeForm.joining_date} onChange={(event) => setEmployeeForm({ ...employeeForm, joining_date: event.target.value })} /><Select label="Status" value={employeeForm.status} onChange={(event) => setEmployeeForm({ ...employeeForm, status: event.target.value })}>{['active', 'probation', 'inactive', 'resigned', 'terminated'].map((value) => <option key={value} value={value}>{value}</option>)}</Select><Select label="Branch" value={employeeForm.branch_id} onChange={(event) => setEmployeeForm({ ...employeeForm, branch_id: event.target.value })}><option value="">Unassigned</option>{(reference.branches || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Select label="Department" value={employeeForm.department_id} onChange={(event) => setEmployeeForm({ ...employeeForm, department_id: event.target.value })}><option value="">None</option>{(reference.departments || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Select label="Designation" value={employeeForm.designation_id} onChange={(event) => setEmployeeForm({ ...employeeForm, designation_id: event.target.value })}><option value="">None</option>{(reference.designations || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Select label="Shift" value={employeeForm.shift_id} onChange={(event) => setEmployeeForm({ ...employeeForm, shift_id: event.target.value })}><option value="">None</option>{(reference.shifts || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Select label="Linked User" value={employeeForm.user_id} onChange={(event) => setEmployeeForm({ ...employeeForm, user_id: event.target.value })}><option value="">No login</option>{(reference.users || []).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.email}</option>)}</Select><Input label="NID Number" value={employeeForm.nid_number} onChange={(event) => setEmployeeForm({ ...employeeForm, nid_number: event.target.value })} /><div className="sm:col-span-2"><Textarea label="Address" value={employeeForm.address} onChange={(event) => setEmployeeForm({ ...employeeForm, address: event.target.value })} /></div></div><div className="mt-4 flex gap-2"><Button busy={saving} onClick={saveEmployee}>{editingEmployeeId ? <Save size={16} /> : <UserPlus size={16} />}{editingEmployeeId ? 'Update Employee' : 'Add Employee'}</Button>{editingEmployeeId && <Button tone="soft" onClick={resetEmployee}>Cancel</Button>}</div></Panel><Panel title="Employee Directory" action={<Input aria-label="Search employees" placeholder="Search employee…" value={search} onChange={(event) => setSearch(event.target.value)} />}><Table rows={filteredEmployees} columns={[{ key: 'employee_no', label: 'Employee No' }, { key: 'name', label: 'Name' }, { key: 'branch_name', label: 'Branch' }, { key: 'department_name', label: 'Department' }, { key: 'designation_name', label: 'Designation' }, { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }, { key: 'actions', label: 'Action', render: (row) => <Button tone="soft" onClick={() => editEmployee(row)}><Edit3 size={14} />Edit</Button> }]} /></Panel></div></div>}

    {['departments', 'designations', 'shifts'].includes(module.key) && <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]"><Panel title={`${referenceForm.id ? 'Edit' : 'Add'} ${module.label.slice(0, -1)}`}><div className="grid gap-3 sm:grid-cols-2"><Input label="Name" value={referenceForm.name} onChange={(event) => setReferenceForm({ ...referenceForm, name: event.target.value })} /><Input label="Code" value={referenceForm.code} onChange={(event) => setReferenceForm({ ...referenceForm, code: event.target.value })} />{module.key === 'departments' && <Select label="Branch" value={referenceForm.branch_id} onChange={(event) => setReferenceForm({ ...referenceForm, branch_id: event.target.value })}><option value="">All branches</option>{(reference.branches || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>}{module.key === 'designations' && <><Select label="Department" value={referenceForm.department_id} onChange={(event) => setReferenceForm({ ...referenceForm, department_id: event.target.value })}><option value="">No department</option>{(reference.departments || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Input label="Grade" type="number" min="1" value={referenceForm.grade} onChange={(event) => setReferenceForm({ ...referenceForm, grade: event.target.value })} /></>}{module.key === 'shifts' && <><Input label="Starts At" type="time" value={referenceForm.starts_at} onChange={(event) => setReferenceForm({ ...referenceForm, starts_at: event.target.value })} /><Input label="Ends At" type="time" value={referenceForm.ends_at} onChange={(event) => setReferenceForm({ ...referenceForm, ends_at: event.target.value })} /><Input label="Grace Minutes" type="number" min="0" value={referenceForm.grace_minutes} onChange={(event) => setReferenceForm({ ...referenceForm, grace_minutes: event.target.value })} /></>}</div><div className="mt-4 flex gap-2"><Button busy={saving} onClick={saveReference}><Save size={16} />{referenceForm.id ? 'Update' : 'Save'}</Button>{referenceForm.id && <Button tone="soft" onClick={() => setReferenceForm({ id: null, name: '', code: '', branch_id: '', department_id: '', grade: 1, starts_at: '10:00', ends_at: '20:00', grace_minutes: 15, annual_days: 10, is_active: true })}>Cancel</Button>}</div></Panel><Panel title={module.label}><Table rows={referenceRows} columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, ...(module.key === 'departments' ? [{ key: 'branch_name', label: 'Branch' }] : []), ...(module.key === 'designations' ? [{ key: 'department_name', label: 'Department' }, { key: 'grade', label: 'Grade' }] : []), ...(module.key === 'shifts' ? [{ key: 'starts_at', label: 'Start' }, { key: 'ends_at', label: 'End' }, { key: 'grace_minutes', label: 'Grace' }] : []), { key: 'actions', label: 'Action', render: (row) => <div className="flex gap-2"><Button tone="soft" onClick={() => editReference(row)}><Edit3 size={14} />Edit</Button><Button tone="danger" onClick={() => deleteReference(row)}><Trash2 size={14} />Delete</Button></div> }]} /></Panel></div>}

    {module.key === 'attendance' && <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
        <Panel title="Record / Correct Attendance" description="Manual correction remains available and has priority over later automatic rebuilds.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Employee" value={attendanceForm.employee_id} onChange={(event) => setAttendanceForm({ ...attendanceForm, employee_id: event.target.value })}><option value="">Select employee</option>{employeeOptions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</Select>
            <Input label="Date" type="date" value={attendanceForm.attendance_date} onChange={(event) => setAttendanceForm({ ...attendanceForm, attendance_date: event.target.value })} />
            <Input label="Check In" type="time" value={attendanceForm.check_in} onChange={(event) => setAttendanceForm({ ...attendanceForm, check_in: event.target.value })} />
            <Input label="Check Out" type="time" value={attendanceForm.check_out} onChange={(event) => setAttendanceForm({ ...attendanceForm, check_out: event.target.value })} />
            <Input label="Late Minutes" type="number" min="0" value={attendanceForm.late_minutes} onChange={(event) => setAttendanceForm({ ...attendanceForm, late_minutes: event.target.value })} />
            <Input label="Overtime Minutes" type="number" min="0" value={attendanceForm.overtime_minutes} onChange={(event) => setAttendanceForm({ ...attendanceForm, overtime_minutes: event.target.value })} />
            <Select label="Status" value={attendanceForm.status} onChange={(event) => setAttendanceForm({ ...attendanceForm, status: event.target.value })}>{['present', 'absent', 'late', 'half_day', 'leave', 'holiday', 'weekend'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select>
            <Textarea label="Note" value={attendanceForm.note} onChange={(event) => setAttendanceForm({ ...attendanceForm, note: event.target.value })} />
          </div>
          <div className="mt-4"><Button busy={saving} onClick={saveAttendance}><Save size={16} />Save Attendance</Button></div>
        </Panel>
        <Panel title="Attendance Filters & Summary">
          <div className="grid gap-3 sm:grid-cols-2"><Input label="From" type="date" value={dateRange.date_from} onChange={(event) => setDateRange({ ...dateRange, date_from: event.target.value })} /><Input label="To" type="date" value={dateRange.date_to} onChange={(event) => setDateRange({ ...dateRange, date_to: event.target.value })} /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><Metric label="Employees" value={attendanceSummary.total_employees || attendanceSummary.summary?.length || 0} icon={Users} /><Metric label="Records" value={attendance.length} icon={Clock3} /></div>
        </Panel>
      </div>
      <Panel title="Attendance Records"><Table rows={attendance} columns={[{ key: 'attendance_date', label: 'Date' }, { key: 'employee_name', label: 'Employee' }, { key: 'branch_name', label: 'Branch' }, { key: 'check_in', label: 'First IN' }, { key: 'check_out', label: 'Last OUT' }, { key: 'exit_count', label: 'Exits' }, { key: 'total_outside_minutes', label: 'Outside (min)' }, { key: 'total_inside_minutes', label: 'Inside (min)' }, { key: 'late_minutes', label: 'Late' }, { key: 'early_leave_minutes', label: 'Early' }, { key: 'source', label: 'Source' }, { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }]} /></Panel>
      <ZktecoAttendancePanel employees={employees} dateRange={dateRange} />
    </div>}

    {module.key === 'leave' && <div className="space-y-5"><div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]"><Panel title="New Leave Request"><div className="grid gap-3 sm:grid-cols-2"><Select label="Employee" value={leaveForm.employee_id} onChange={(event) => setLeaveForm({ ...leaveForm, employee_id: event.target.value })}><option value="">Select employee</option>{employeeOptions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</Select><Select label="Leave Type" value={leaveForm.leave_type_id} onChange={(event) => setLeaveForm({ ...leaveForm, leave_type_id: event.target.value })}><option value="">Select type</option>{(reference.leave_types || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Input label="From" type="date" value={leaveForm.starts_on} onChange={(event) => setLeaveForm({ ...leaveForm, starts_on: event.target.value })} /><Input label="To" type="date" value={leaveForm.ends_on} onChange={(event) => setLeaveForm({ ...leaveForm, ends_on: event.target.value })} /><div className="sm:col-span-2"><Textarea label="Reason" value={leaveForm.reason} onChange={(event) => setLeaveForm({ ...leaveForm, reason: event.target.value })} /></div></div><div className="mt-4"><Button busy={saving} onClick={saveLeave}><Plus size={16} />Submit Request</Button></div></Panel><Panel title="Leave Requests"><Table rows={leaves} columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'leave_type_name', label: 'Type' }, { key: 'starts_on', label: 'From' }, { key: 'ends_on', label: 'To' }, { key: 'days', label: 'Days' }, { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }, { key: 'action', label: 'Action', render: (row) => row.status === 'pending' ? <div className="flex gap-2"><Button tone="success" onClick={() => reviewLeave(row, 'approved')}>Approve</Button><Button tone="danger" onClick={() => reviewLeave(row, 'rejected')}>Reject</Button></div> : '-' }]} /></Panel></div><Panel title="Leave Balance"><Table rows={leaveBalances} columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'leave_type_name', label: 'Type' }, { key: 'entitled_days', label: 'Entitled' }, { key: 'used_days', label: 'Used' }, { key: 'remaining_days', label: 'Remaining' }, { key: 'year', label: 'Year' }]} /></Panel></div>}

    {module.key === 'salary' && <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]"><Panel title="Salary Structure" description="Staff-friendly component fields replace raw JSON input."><div className="grid gap-3 sm:grid-cols-2"><Select label="Employee" value={salaryForm.employee_id} onChange={(event) => setSalaryForm({ ...salaryForm, employee_id: event.target.value })}><option value="">Select employee</option>{employeeOptions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</Select><Input label="Effective From" type="date" value={salaryForm.effective_from} onChange={(event) => setSalaryForm({ ...salaryForm, effective_from: event.target.value })} /><Input label="Basic Salary" type="number" min="0" value={salaryForm.basic_salary} onChange={(event) => setSalaryForm({ ...salaryForm, basic_salary: event.target.value })} /><Input label="House Rent" type="number" min="0" value={salaryForm.house_rent} onChange={(event) => setSalaryForm({ ...salaryForm, house_rent: event.target.value })} /><Input label="Medical" type="number" min="0" value={salaryForm.medical} onChange={(event) => setSalaryForm({ ...salaryForm, medical: event.target.value })} /><Input label="Transport" type="number" min="0" value={salaryForm.transport} onChange={(event) => setSalaryForm({ ...salaryForm, transport: event.target.value })} /><Input label="Other Earning" type="number" min="0" value={salaryForm.other_earning} onChange={(event) => setSalaryForm({ ...salaryForm, other_earning: event.target.value })} /><Input label="Provident Fund" type="number" min="0" value={salaryForm.provident_fund} onChange={(event) => setSalaryForm({ ...salaryForm, provident_fund: event.target.value })} /><Input label="Other Deduction" type="number" min="0" value={salaryForm.other_deduction} onChange={(event) => setSalaryForm({ ...salaryForm, other_deduction: event.target.value })} /><Input label="Tax" type="number" min="0" value={salaryForm.tax_amount} onChange={(event) => setSalaryForm({ ...salaryForm, tax_amount: event.target.value })} /></div><div className="mt-4"><Button busy={saving} onClick={saveSalary}><Save size={16} />Save Structure</Button></div></Panel><Panel title="Active Salary Structures"><Table rows={salaryStructures} columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'effective_from', label: 'From' }, { key: 'basic_salary', label: 'Basic', render: (row) => money(row.basic_salary) }, { key: 'gross_salary', label: 'Gross', render: (row) => money(row.gross_salary) }, { key: 'net_salary', label: 'Net', render: (row) => money(row.net_salary) }, { key: 'is_active', label: 'Status', render: (row) => <Status value={row.is_active ? 'active' : 'inactive'} /> }]} /></Panel></div>}

    {module.key === 'payroll' && <div className="space-y-5"><div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]"><Panel title="Generate Payroll"><div className="grid gap-3 sm:grid-cols-2"><Input label="Period Name" value={payrollForm.name} onChange={(event) => setPayrollForm({ ...payrollForm, name: event.target.value })} /><Select label="Branch" value={payrollForm.branch_id} onChange={(event) => setPayrollForm({ ...payrollForm, branch_id: event.target.value })}><option value="">All branches</option>{(reference.branches || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select><Input label="From" type="date" value={payrollForm.starts_on} onChange={(event) => setPayrollForm({ ...payrollForm, starts_on: event.target.value })} /><Input label="To" type="date" value={payrollForm.ends_on} onChange={(event) => setPayrollForm({ ...payrollForm, ends_on: event.target.value })} /></div><div className="mt-4 flex flex-wrap gap-2"><Button busy={saving} onClick={generatePayroll}><Banknote size={16} />Generate Draft</Button><Button tone="soft" onClick={exportPayroll}><Download size={16} />Export CSV</Button></div></Panel><Panel title="Payroll Periods"><Table rows={payrollPeriods} columns={[{ key: 'period_no', label: 'Period' }, { key: 'name', label: 'Name' }, { key: 'gross_total', label: 'Gross', render: (row) => money(row.gross_total) }, { key: 'net_total', label: 'Net', render: (row) => money(row.net_total) }, { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }, { key: 'action', label: 'Open', render: (row) => <Button tone="soft" onClick={() => openPeriod(row)}>Open</Button> }]} /></Panel></div>{periodDetail && <div className="space-y-5"><Panel title={`Selected Payroll: ${periodDetail.name || selectedPeriod?.name}`} action={<div className="flex flex-wrap gap-2">{['review', 'approve', 'lock', 'pay', 'reverse'].map((action) => <Button key={action} tone="soft" busy={saving} onClick={() => payrollAction(action)}>{action}</Button>)}</div>}><Table rows={periodDetail.entries || []} columns={[{ key: 'employee_no', label: 'Employee No' }, { key: 'employee_name', label: 'Employee' }, { key: 'gross_salary', label: 'Gross', render: (row) => money(row.gross_salary) }, { key: 'total_deduction', label: 'Deduction', render: (row) => money(row.total_deduction) }, { key: 'net_salary', label: 'Net', render: (row) => money(row.net_salary) }]} /></Panel></div>}</div>}

    {['payslip', 'commission'].includes(module.key) && <div className="space-y-5"><Panel title="Select Payroll Period"><Table rows={payrollPeriods} columns={[{ key: 'period_no', label: 'Period' }, { key: 'name', label: 'Name' }, { key: 'net_total', label: 'Net', render: (row) => money(row.net_total) }, { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }, { key: 'action', label: 'Open', render: (row) => <Button tone="soft" onClick={() => openPeriod(row, module.key)}>Open</Button> }]} /></Panel>{selectedPeriod && module.key === 'payslip' && <Panel title={`Payslips · ${selectedPeriod.name}`} action={<Button busy={saving} onClick={publishPayslips}><FileText size={16} />Publish Payslips</Button>}><Table rows={payslips.length ? payslips : (periodDetail?.entries || [])} columns={[{ key: 'employee_no', label: 'Employee No' }, { key: 'employee_name', label: 'Employee' }, { key: 'gross_salary', label: 'Gross', render: (row) => money(row.gross_salary) }, { key: 'net_salary', label: 'Net', render: (row) => money(row.net_salary) }, { key: 'status', label: 'Publication', render: (row) => <Status value={row.payslip?.public_token ? 'published' : 'draft'} /> }]} /></Panel>}{selectedPeriod && module.key === 'commission' && <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]"><Panel title="Commission & Bonus Adjustment"><Select label="Employee Entry" value={adjustForm.entry_id} onChange={(event) => setAdjustForm({ ...adjustForm, entry_id: event.target.value })}><option value="">Select entry</option>{(periodDetail?.entries || []).map((row) => <option key={row.id} value={row.id}>{row.employee_no} · {row.employee_name}</option>)}</Select><div className="mt-3 grid gap-3 sm:grid-cols-2"><Input label="Commission" type="number" min="0" value={adjustForm.commission_amount} onChange={(event) => setAdjustForm({ ...adjustForm, commission_amount: event.target.value })} /><Input label="Bonus" type="number" min="0" value={adjustForm.bonus_amount} onChange={(event) => setAdjustForm({ ...adjustForm, bonus_amount: event.target.value })} /></div><div className="mt-3"><Textarea label="Note" value={adjustForm.note} onChange={(event) => setAdjustForm({ ...adjustForm, note: event.target.value })} /></div><div className="mt-4"><Button busy={saving} onClick={saveAdjustment}><Save size={16} />Save Adjustment</Button></div></Panel><Panel title="Payroll Entries"><Table rows={periodDetail?.entries || []} columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'commission_amount', label: 'Commission', render: (row) => money(row.commission_amount) }, { key: 'bonus_amount', label: 'Bonus', render: (row) => money(row.bonus_amount) }, { key: 'net_salary', label: 'Net', render: (row) => money(row.net_salary) }]} /></Panel></div>}</div>}

    {module.key === 'loans' && <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]"><Panel title="Advance / Loan Request"><div className="grid gap-3 sm:grid-cols-2"><Select label="Employee" value={loanForm.employee_id} onChange={(event) => setLoanForm({ ...loanForm, employee_id: event.target.value })}><option value="">Select employee</option>{employeeOptions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</Select><Select label="Type" value={loanForm.loan_type} onChange={(event) => setLoanForm({ ...loanForm, loan_type: event.target.value })}><option value="advance">Advance</option><option value="loan">Loan</option><option value="emergency">Emergency</option></Select><Input label="Principal Amount" type="number" min="0" value={loanForm.principal_amount} onChange={(event) => setLoanForm({ ...loanForm, principal_amount: event.target.value })} /><Input label="Installment Amount" type="number" min="0" value={loanForm.installment_amount} onChange={(event) => setLoanForm({ ...loanForm, installment_amount: event.target.value })} /><Input label="Starts On" type="date" value={loanForm.starts_on} onChange={(event) => setLoanForm({ ...loanForm, starts_on: event.target.value })} /><Textarea label="Note" value={loanForm.note} onChange={(event) => setLoanForm({ ...loanForm, note: event.target.value })} /></div><div className="mt-4"><Button busy={saving} onClick={saveLoan}><Plus size={16} />Create Request</Button></div></Panel><Panel title="Loan & Advance Register"><Table rows={loans} columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'loan_type', label: 'Type' }, { key: 'principal_amount', label: 'Principal', render: (row) => money(row.principal_amount) }, { key: 'outstanding_amount', label: 'Outstanding', render: (row) => money(row.outstanding_amount) }, { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }, { key: 'action', label: 'Action', render: (row) => <div className="flex gap-2">{row.status === 'pending' && <><Button tone="success" onClick={() => loanAction(row, 'approve')}>Approve</Button><Button tone="danger" onClick={() => loanAction(row, 'reject')}>Reject</Button></>}{row.status === 'approved' && <Button tone="soft" onClick={() => loanAction(row, 'activate')}>Activate</Button>}{['active', 'approved'].includes(row.status) && <Button tone="soft" onClick={() => loanAction(row, 'settle')}>Settle</Button>}</div> }]} /></Panel></div>}

    {module.key === 'performance' && <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]"><Panel title={performanceForm.id ? 'Edit Performance Review' : 'New Performance Review'}><div className="grid gap-3 sm:grid-cols-2"><Select label="Employee" value={performanceForm.employee_id} onChange={(event) => setPerformanceForm({ ...performanceForm, employee_id: event.target.value })}><option value="">Select employee</option>{employeeOptions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</Select><Input label="Review Date" type="date" value={performanceForm.review_date} onChange={(event) => setPerformanceForm({ ...performanceForm, review_date: event.target.value })} /><Input label="Score" type="number" min="0" max="100" value={performanceForm.score} onChange={(event) => setPerformanceForm({ ...performanceForm, score: event.target.value })} /><Input label="Outcome" value={performanceForm.outcome} onChange={(event) => setPerformanceForm({ ...performanceForm, outcome: event.target.value })} /><Textarea label="Goals (one per line)" value={performanceForm.goals} onChange={(event) => setPerformanceForm({ ...performanceForm, goals: event.target.value })} /><Textarea label="Competencies (one per line)" value={performanceForm.competencies} onChange={(event) => setPerformanceForm({ ...performanceForm, competencies: event.target.value })} /><div className="sm:col-span-2"><Textarea label="Summary" value={performanceForm.summary} onChange={(event) => setPerformanceForm({ ...performanceForm, summary: event.target.value })} /></div></div><div className="mt-4 flex gap-2"><Button busy={saving} onClick={savePerformance}><Save size={16} />Save Review</Button>{performanceForm.id && <Button tone="soft" onClick={resetPerformance}>Cancel</Button>}</div></Panel><Panel title="Performance History"><Table rows={performance} columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'review_date', label: 'Date' }, { key: 'score', label: 'Score' }, { key: 'outcome', label: 'Outcome' }, { key: 'reviewer_name', label: 'Reviewer' }, { key: 'action', label: 'Action', render: (row) => <Button tone="soft" onClick={() => setPerformanceForm({ id: row.id, employee_id: row.employee_id || '', review_type: row.review_type || 'performance', review_date: row.review_date || today(), score: row.score ?? '', goals: Array.isArray(row.goals) ? row.goals.join('\n') : '', competencies: Array.isArray(row.competencies) ? row.competencies.join('\n') : '', summary: row.summary || '', outcome: row.outcome || '' })}><Edit3 size={14} />Edit</Button> }]} /></Panel></div>}

    {module.key === 'reports' && <div className="space-y-5"><Panel title="Acceptance Status" description="Operational acceptance map for the live HRM and payroll workflows."><div className="flex flex-wrap gap-2">{STAGE7_WORKFLOW_LABELS.map((label) => <span key={label} className="rounded-full bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_10%,transparent)] px-3 py-1.5 text-xs font-black text-[var(--nst-dashboard-primary)]">{label}</span>)}</div></Panel><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Employees" value={summary.active_employees || 0} icon={Users} /><Metric label="Payroll Due" value={money(summary.payroll_due)} icon={Banknote} /><Metric label="Database" value={acceptance.database_ready ? 'Ready' : 'Missing'} icon={ShieldCheck} /><Metric label="Routes" value={acceptance.routes_ready ? 'Ready' : 'Missing'} icon={CheckCircle2} /></div><div className="grid gap-5 xl:grid-cols-2"><Panel title="Payroll Reports" action={<Button tone="soft" onClick={exportPayroll}><Download size={16} />Export CSV</Button>}><Table rows={payrollPeriods} columns={[{ key: 'period_no', label: 'Period' }, { key: 'name', label: 'Name' }, { key: 'gross_total', label: 'Gross', render: (row) => money(row.gross_total) }, { key: 'net_total', label: 'Net', render: (row) => money(row.net_total) }, { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }]} /></Panel><Panel title="Leave Balance Report"><Table rows={leaveBalances.slice(0, 300)} columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'leave_type_name', label: 'Type' }, { key: 'used_days', label: 'Used' }, { key: 'remaining_days', label: 'Remaining' }]} /></Panel></div><Panel title="HRM Audit History"><Table rows={audit} columns={[{ key: 'action', label: 'Action' }, { key: 'resource_type', label: 'Resource' }, { key: 'resource_id', label: 'ID' }, { key: 'user_name', label: 'User' }, { key: 'created_at', label: 'Time' }]} /></Panel></div>}
  </div>;
}
