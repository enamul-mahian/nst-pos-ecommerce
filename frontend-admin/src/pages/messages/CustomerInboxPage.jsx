import { useEffect, useMemo, useState } from 'react';
import { corporateOpsService } from '../../services/corporateOpsService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { MessageCircle as NstHdrMessageCircle, Search } from 'lucide-react';

const FOLDERS = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' },
  { key: 'draft', label: 'Draft' },
  { key: 'starred', label: 'Starred' },
  { key: 'closed', label: 'Closed' },
  { key: 'trash', label: 'Trash' },
];

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function normalizeList(payload) {
  const raw =
    payload?.data?.data ||
    payload?.data?.messages ||
    payload?.data ||
    payload?.messages ||
    payload ||
    [];

  if (Array.isArray(raw)) return raw;

  if (Array.isArray(raw?.data)) return raw.data;

  return [];
}

function normalizeMessage(item) {
  const id = item?.id || item?.message_id;

  return {
    id,
    ticketNo: item?.ticket_no || item?.ticketNo || item?.ticket || `MSG-${id || 'NA'}`,
    name: item?.name || item?.customer_name || item?.customerName || item?.customer?.name || 'Customer',
    email: item?.email || item?.customer_email || item?.customer?.email || '',
    phone: item?.phone || item?.customer_phone || item?.customer?.phone || '',
    subject: item?.subject || 'Website Chat',
    category: item?.category || item?.source || 'website_chat',
    message: item?.message || item?.body || item?.preview || '',
    status: String(item?.status || 'open').toLowerCase(),
    priority: item?.priority || 'medium',
    folder: String(item?.folder || '').toLowerCase(),
    source: item?.source || '',
    createdAt: item?.created_at || item?.createdAt || item?.created || item?.last_message_at || null,
    updatedAt: item?.updated_at || item?.updatedAt || item?.last_message_at || null,
    lastReply: item?.admin_reply || item?.last_reply || item?.lastReply || '',
    unread: Boolean(item?.staff_unread || item?.unread || item?.is_read === false),
    raw: item,
  };
}

function dhakaExactTime(dateValue) {
  if (!dateValue) return '-';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).formatToParts(date);

    const get = (type) => parts.find((part) => part.type === type)?.value || '';

    return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')}:${get('second')} ${get('dayPeriod')}`;
  } catch {
    return date.toLocaleString('en-GB', {
      timeZone: 'Asia/Dhaka',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }
}

function initials(name) {
  const text = String(name || '').trim();
  if (!text) return 'NA';

  const parts = text.replace(/\s+/g, ' ').split(' ').filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return text.slice(0, 2).toUpperCase();
}

function statusClass(status) {
  if (status === 'closed') return 'bg-slate-100 text-slate-700';
  if (status === 'replied') return 'bg-emerald-100 text-emerald-700';
  if (status === 'pending') return 'bg-amber-100 text-amber-700';
  return 'bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]';
}

export default function CustomerInboxPage() {
  const [messages, setMessages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeMessage, setActiveMessage] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [search, setSearch] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSaving, setComposeSaving] = useState(false);
  const [composeForm, setComposeForm] = useState({
    name: '',
    phone: '',
    email: '',
    subject: '',
    category: 'general_support',
    message: '',
    cloud_link: '',
  });

  const loadMessages = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await corporateOpsService.listMessages();
      const payload = response?.data || response;
      const list = normalizeList(payload).map(normalizeMessage);

      setMessages(list);

      if (!activeId && list.length) {
        setActiveId(list[0].id);
      }

      if (!list.length) {
        setActiveMessage(null);
      }
    } catch (err) {
      setError(errorMessage(err, 'Inbox load failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };
  const loadMessageDetail = async (id) => {
    if (!id) {
      setActiveMessage(null);
      return;
    }

    setDetailLoading(true);

    try {
      const response = await corporateOpsService.showMessage(id);
      const payload = response?.data || response;
      const data = payload?.data || payload?.message || payload;
      const normalized = normalizeMessage(data);

      normalized.thread =
        data?.thread ||
        data?.replies ||
        data?.data?.thread ||
        [];

      setActiveMessage(normalized);
    } catch (err) {
      const found = messages.find((message) => message.id === id);
      setActiveMessage(found || null);
      setError(errorMessage(err, 'Message detail could not be loaded.'));
    } finally {
      setDetailLoading(false);
    }
  };
  useEffect(() => {
    loadMessages();
  }, []);

  useEffect(() => {
    if (activeId) {
      loadMessageDetail(activeId);
    }
  }, [activeId]);

  const folderCounts = useMemo(() => {
    const counts = Object.fromEntries(FOLDERS.map((folder) => [folder.key, 0]));

    for (const message of messages) {
      if (message.folder === 'trash') counts.trash += 1;
      else if (message.status === 'closed') counts.closed += 1;
      else counts.inbox += 1;
    }

    return counts;
  }, [messages]);

  const filteredMessages = useMemo(() => {
    const term = search.trim().toLowerCase();

    return messages.filter((message) => {
      const inFolder =
        activeFolder === 'trash'
          ? message.folder === 'trash'
          : activeFolder === 'closed'
            ? message.status === 'closed'
            : activeFolder === 'inbox'
              ? message.folder !== 'trash' && message.status !== 'closed'
              : activeFolder === 'starred'
                ? Boolean(message.raw?.is_starred || message.raw?.starred)
                : activeFolder === 'sent'
                  ? message.status === 'replied'
                  : activeFolder === 'draft'
                    ? false
                    : true;

      if (!inFolder) return false;

      if (!term) return true;

      return [
        message.name,
        message.email,
        message.phone,
        message.subject,
        message.message,
        message.ticketNo,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [messages, activeFolder, search]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  };

  const selectAllVisible = () => {
    if (selectedIds.size === filteredMessages.length) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(filteredMessages.map((message) => message.id)));
  };

  const updateLocalMessage = (id, patch) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === id ? { ...message, ...patch } : message))
    );

    setActiveMessage((prev) =>
      prev && prev.id === id ? { ...prev, ...patch } : prev
    );
  };

  const deleteMessages = async (ids) => {
    if (!ids.length) return;

    const confirmed = window.confirm(
      `Permanently delete ${ids.length} selected message(s)? This cannot be undone.`
    );

    if (!confirmed) return;

    setError('');
    setNotice('');

    try {
      await Promise.all(ids.map((id) => corporateOpsService.deleteMessage(id)));

      const remaining = messages.filter((message) => !ids.includes(message.id));
      setMessages(remaining);
      setSelectedIds(new Set());

      if (activeId && ids.includes(activeId)) {
        setActiveId(remaining[0]?.id || null);
        setActiveMessage(remaining[0] || null);
      }

      setNotice('Message permanently deleted.');
    } catch (err) {
      setError(errorMessage(err, 'Delete failed. Please try again.'));
    }
  };

  const deleteSelected = () => deleteMessages(Array.from(selectedIds));
  const deleteActiveMessage = () => {
    if (activeMessage?.id) deleteMessages([activeMessage.id]);
  };

  const closeSelected = async () => {
    const ids = Array.from(selectedIds);

    if (!ids.length) return;

    setError('');
    setNotice('');

    try {
      await Promise.all(ids.map((id) => corporateOpsService.closeMessage(id)));

      ids.forEach((id) => updateLocalMessage(id, { status: 'closed', unread: false }));
      setSelectedIds(new Set());
      setNotice('Selected message(s) closed.');
    } catch (err) {
      setError(errorMessage(err, 'Close failed. Please try again.'));
    }
  };

  const closeActiveMessage = async () => {
    if (!activeMessage?.id) return;

    setError('');
    setNotice('');

    try {
      await corporateOpsService.closeMessage(activeMessage.id);

      updateLocalMessage(activeMessage.id, { status: 'closed', unread: false });
      setNotice('Message closed.');
    } catch (err) {
      setError(errorMessage(err, 'Close failed. Please try again.'));
    }
  };

  const sendReply = async () => {
    if (!activeMessage?.id || !replyDraft.trim()) return;

    setSendingReply(true);
    setError('');
    setNotice('');

    try {
      await corporateOpsService.replyMessage(activeMessage.id, { message: replyDraft.trim() });

      setReplyDraft('');
      updateLocalMessage(activeMessage.id, {
        status: 'replied',
        lastReply: replyDraft.trim(),
        unread: false,
      });

      await loadMessageDetail(activeMessage.id);
      await loadMessages();

      setNotice('Reply sent.');
    } catch (err) {
      setError(errorMessage(err, 'Reply failed. Please try again.'));
    } finally {
      setSendingReply(false);
    }
  };

  const sendNewMessage = async (event) => {
    event.preventDefault();
    if (!composeForm.subject.trim() || !composeForm.message.trim()) return;

    setComposeSaving(true);
    setError('');
    setNotice('');

    try {
      await corporateOpsService.createMessage({
        ...composeForm,
        name: composeForm.name.trim() || undefined,
        phone: composeForm.phone.trim() || undefined,
        email: composeForm.email.trim() || undefined,
        cloud_link: composeForm.cloud_link.trim() || undefined,
      });
      setComposeForm({ name: '', phone: '', email: '', subject: '', category: 'general_support', message: '', cloud_link: '' });
      setComposeOpen(false);
      setNotice('New customer portal message sent.');
      await loadMessages();
    } catch (err) {
      setError(errorMessage(err, 'New message could not be sent.'));
    } finally {
      setComposeSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--nst-dashboard-bg)] px-4 py-5 text-[var(--nst-dashboard-text)] md:px-6">
      <NstPageHeader icon={NstHdrMessageCircle} title={<>Customer Inbox
          </>} subtitle={<>Customer support, contact, warranty and invoice messages are managed in one clean responsive inbox.
          </>} actions={<><label className="flex h-10 w-80 max-w-full items-center gap-2 rounded-lg border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-3 text-[var(--nst-dashboard-muted)]">
          <Search size={16} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-semibold text-[var(--nst-dashboard-text)] outline-none"
            placeholder="Search customer messages"
          />
        </label></>}/>

      {error ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <aside className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="mb-4 w-full rounded-2xl bg-[var(--nst-dashboard-primary)] px-4 py-3 text-sm font-black text-white shadow-lg shadow-[var(--nst-dashboard-shadow)]"
          >
            Compose / New Message
          </button>

          <div className="space-y-2">
            {FOLDERS.map((folder) => (
              <button
                key={folder.key}
                type="button"
                onClick={() => {
                  setActiveFolder(folder.key);
                  setSelectedIds(new Set());
                }}
                className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-black ${
                  activeFolder === folder.key
                    ? 'bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{folder.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                  {folderCounts[folder.key] || 0}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
              Support Tip
            </p>
            <p className="mt-3 text-xs font-semibold leading-6 text-slate-500">
              New, Open, Replied and Closed status helps your team track customer conversations cleanly.
            </p>
          </div>
        </aside>

        <main className="rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-100">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-4">
            <label className="flex items-center gap-2 text-sm font-black text-slate-700">
              <input
                type="checkbox"
                checked={
                  filteredMessages.length > 0 &&
                  selectedIds.size === filteredMessages.length
                }
                onChange={selectAllVisible}
              />
              Select all
            </label>

            <button
              type="button"
              onClick={deleteSelected}
              disabled={!selectedIds.size}
              className="rounded-xl px-3 py-2 text-sm font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              Delete
            </button>

            <button
              type="button"
              onClick={closeSelected}
              disabled={!selectedIds.size}
              className="rounded-xl px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              Close
            </button>

            <button
              type="button"
              onClick={loadMessages}
              className="ml-auto rounded-xl px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          <div className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400">
            {filteredMessages.length} Messages
          </div>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center text-sm font-bold text-slate-400">
              Loading customer inbox...
            </div>
          ) : filteredMessages.length ? (
            <div className="space-y-2 px-3 pb-4">
              {filteredMessages.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => setActiveId(message.id)}
                  className={`flex w-full items-center gap-3 rounded-3xl border px-4 py-4 text-left transition ${
                    activeId === message.id
                      ? 'border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)]'
                      : 'border-slate-100 bg-white hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(message.id)}
                    onChange={(event) => {
                      event.stopPropagation();
                      toggleSelect(message.id);
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />

                  <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--nst-dashboard-primary-soft)] text-xs font-black text-[var(--nst-dashboard-primary)]">
                    {initials(message.name)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-slate-900">
                        {message.name}
                      </p>
                      <span className="text-slate-300">•</span>
                      <p className="truncate text-sm font-black text-slate-950">
                        {message.subject}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {message.message}
                    </p>
                  </div>

                  <div className="hidden text-right text-xs font-bold text-slate-400 md:block">
                    {dhakaExactTime(message.createdAt)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center text-sm font-bold text-slate-400">
              No customer messages found.
            </div>
          )}
        </main>

        <aside className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100">
          {detailLoading ? (
            <div className="py-20 text-center text-sm font-bold text-slate-400">
              Loading message...
            </div>
          ) : activeMessage ? (
            <>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                {activeMessage.ticketNo}
              </p>

              <h2 className="mt-3 text-xl font-black text-slate-950">
                {activeMessage.subject}
              </h2>

              <div className="mt-5 flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--nst-dashboard-primary)] text-sm font-black text-white">
                  {initials(activeMessage.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-black text-slate-950">{activeMessage.name}</p>
                  <p className="truncate text-xs font-bold text-slate-500">
                    {activeMessage.email || '-'} • {activeMessage.phone || '-'}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase text-slate-400">Status</p>
                  <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${statusClass(activeMessage.status)}`}>
                    {activeMessage.status}
                  </span>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase text-slate-400">Priority</p>
                  <p className="mt-2 text-sm font-black capitalize text-slate-800">
                    {activeMessage.priority}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase text-slate-400">Assigned</p>
                  <p className="mt-2 text-sm font-black text-slate-800">Unassigned</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase text-slate-400">Received</p>
                  <p className="mt-2 text-xs font-black text-slate-800">
                    {dhakaExactTime(activeMessage.createdAt)}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-3xl bg-slate-50 p-5 text-sm font-semibold leading-6 text-slate-700">
                <p className="mb-3 text-xs font-black text-slate-400">
                  {dhakaExactTime(activeMessage.createdAt)}
                </p>
                {activeMessage.message}
              </div>

              {activeMessage.lastReply ? (
                <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-800">
                  <p className="mb-2 text-xs font-black uppercase">Last Reply</p>
                  {activeMessage.lastReply}
                </div>
              ) : null}

              {Array.isArray(activeMessage.thread) && activeMessage.thread.length ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-black uppercase text-slate-400">Thread</p>
                  {activeMessage.thread.map((item, index) => (
                    <div
                      key={`${item.created_at || index}-${index}`}
                      className={`rounded-3xl p-4 text-sm font-semibold ${
                        item.sender_type === 'staff'
                          ? 'bg-blue-50 text-blue-900'
                          : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      <p className="mb-2 text-xs font-black uppercase opacity-60">
                        {item.sender_type === 'staff' ? 'NST Support' : activeMessage.name}
                      </p>
                      {item.message}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={closeActiveMessage}
                  className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-200"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={deleteActiveMessage}
                  className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-100"
                >
                  Delete
                </button>
              </div>

              <div className="mt-5">
                <textarea
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  rows={5}
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:bg-white"
                  placeholder="Type your reply..."
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sendingReply || !replyDraft.trim()}
                  className="mt-3 w-full rounded-2xl bg-[var(--nst-dashboard-primary)] px-4 py-3 text-sm font-black text-white shadow-lg shadow-[var(--nst-dashboard-shadow)] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {sendingReply ? 'Sending...' : 'Reply'}
                </button>
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-sm font-bold text-slate-400">
              Select a message.
            </div>
          )}
        </aside>
      </div>

      {composeOpen ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <form onSubmit={sendNewMessage} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--nst-dashboard-primary)]">Customer Portal</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Compose New Message</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Enter a registered customer phone, email or customer details.</p>
              </div>
              <button type="button" onClick={() => setComposeOpen(false)} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600">Close</button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {[
                ['name', 'Customer Name'],
                ['phone', 'Customer Phone'],
                ['email', 'Customer Email'],
                ['subject', 'Subject'],
              ].map(([key, label]) => (
                <label key={key} className="text-sm font-black text-slate-700">
                  {label}
                  <input
                    type={key === 'email' ? 'email' : 'text'}
                    required={key === 'subject'}
                    value={composeForm[key]}
                    onChange={(event) => setComposeForm((previous) => ({ ...previous, [key]: event.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]"
                  />
                </label>
              ))}
              <label className="text-sm font-black text-slate-700">
                Category
                <select value={composeForm.category} onChange={(event) => setComposeForm((previous) => ({ ...previous, category: event.target.value }))} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]">
                  <option value="general_support">General Support</option>
                  <option value="order_support">Order Support</option>
                  <option value="warranty">Warranty</option>
                  <option value="invoice">Invoice</option>
                </select>
              </label>
              <label className="text-sm font-black text-slate-700">
                Cloud Link (optional)
                <input type="url" value={composeForm.cloud_link} onChange={(event) => setComposeForm((previous) => ({ ...previous, cloud_link: event.target.value }))} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]" />
              </label>
              <label className="text-sm font-black text-slate-700 md:col-span-2">
                Message
                <textarea required rows={6} value={composeForm.message} onChange={(event) => setComposeForm((previous) => ({ ...previous, message: event.target.value }))} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]" />
              </label>
            </div>

            <button disabled={composeSaving} className="mt-5 w-full rounded-2xl bg-[var(--nst-dashboard-primary)] px-5 py-3.5 text-sm font-black text-white disabled:opacity-60">
              {composeSaving ? 'Sending...' : 'Send to Customer Portal'}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}