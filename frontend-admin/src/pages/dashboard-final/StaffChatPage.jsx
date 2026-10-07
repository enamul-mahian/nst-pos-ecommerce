import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Plus, Search, Send, Paperclip, Users, RefreshCw, Circle, X, Bell } from 'lucide-react';
import dashboardOperatingService from '../../services/dashboardOperatingService';
import { NstPageHeader, NstButton, NstIconButton } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

function Shell({ children, className = '' }) {
  return <section className={`rounded-[28px] border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] shadow-[var(--nst-dashboard-shadow)] ${className}`}>{children}</section>;
}

export default function StaffChatPage() {
  const { user } = useAuth();
  const currentUserId = Number(user?.user?.id || user?.id || 0);
  const [threads, setThreads] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [presence, setPresence] = useState([]);
  const [query, setQuery] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const previousLastId = useRef(null);
  const typingTimer = useRef(null);

  const loadThreads = async () => {
    try { const res = await dashboardOperatingService.chatThreads(); setThreads(res?.data?.data || []); }
    catch (err) { setError(err?.response?.data?.message || 'Staff Chat could not load.'); }
  };

  const loadMessages = async (threadId, silent = false) => {
    if (!threadId) return;
    if (!silent) setLoading(true);
    try {
      const res = await dashboardOperatingService.chatMessages(threadId);
      const next = res?.data?.data || [];
      const last = next.at(-1);
      if (silent && last?.id && previousLastId.current && last.id > previousLastId.current && last.sender_id) {
        if ('Notification' in window && document.hidden && window.Notification.permission === 'granted') new window.Notification(`NST Staff Chat — ${last.sender_name}`, { body: last.body || 'Sent an attachment' });
      }
      previousLastId.current = last?.id || previousLastId.current;
      setMessages(next);
      setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 30);
      await loadThreads();
    } catch (err) { if (!silent) setError(err?.response?.data?.message || 'Messages could not load.'); }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => {
    loadThreads();
    dashboardOperatingService.chatUsers().then((res) => setUsers(res?.data?.data || [])).catch(() => {});
    dashboardOperatingService.heartbeat().catch(() => {});
    const heartbeat = setInterval(() => dashboardOperatingService.heartbeat().catch(() => {}), 30000);
    return () => clearInterval(heartbeat);
  }, []);

  useEffect(() => {
    if (!activeId) return undefined;
    loadMessages(activeId);
    const poll = setInterval(() => { loadMessages(activeId, true); dashboardOperatingService.chatPresence(activeId).then((res) => setPresence(res?.data?.data || [])).catch(() => {}); }, 4000);
    return () => clearInterval(poll);
  }, [activeId]);

  const active = threads.find((thread) => thread.id === activeId);
  const filteredThreads = useMemo(() => threads.filter((thread) => (thread.title || '').toLowerCase().includes(query.toLowerCase())), [threads, query]);

  const createThread = async () => {
    if (!selectedUsers.length) return;
    try {
      const res = await dashboardOperatingService.createChatThread({ participant_ids: selectedUsers });
      const id = res?.data?.data?.id;
      setNewChatOpen(false); setSelectedUsers([]); await loadThreads(); setActiveId(id);
    } catch (err) { setError(err?.response?.data?.message || 'Chat could not be created.'); }
  };

  const send = async (event) => {
    event.preventDefault(); if (!activeId || (!body.trim() && files.length === 0)) return;
    setSending(true); setError('');
    try {
      const form = new FormData(); form.append('body', body.trim()); files.forEach((file) => form.append('attachments[]', file));
      await dashboardOperatingService.sendChatMessage(activeId, form);
      setBody(''); setFiles([]); await loadMessages(activeId);
      dashboardOperatingService.updateChatPresence(activeId, false).catch(() => {});
    } catch (err) { setError(err?.response?.data?.message || 'Message could not be sent.'); }
    finally { setSending(false); }
  };

  const type = (value) => {
    setBody(value);
    if (!activeId) return;
    dashboardOperatingService.updateChatPresence(activeId, true).catch(() => {});
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => dashboardOperatingService.updateChatPresence(activeId, false).catch(() => {}), 1600);
  };

  const askNotification = async () => {
    if ('Notification' in window && window.Notification.permission === 'default') await window.Notification.requestPermission();
  };

  return <main className="min-h-full bg-[var(--nst-dashboard-bg)] p-4 text-[var(--nst-dashboard-text)] md:p-6">
    <div className="mx-auto max-w-[1650px] space-y-5">
      <NstPageHeader
        icon={MessageCircle}
        title="Staff Chat"
        subtitle="Secure staff messaging with attachments, seen state, presence and browser alerts."
        actions={<>
          <NstIconButton label="Enable browser notifications" icon={Bell} onClick={askNotification}/>
          <NstButton variant="primary" icon={Plus} onClick={() => setNewChatOpen(true)}>New Chat</NstButton>
        </>}
      />
      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-500">{error}</div>}

      <div className="grid min-h-[720px] gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Shell className="overflow-hidden">
          <div className="border-b border-[var(--nst-dashboard-border)] p-4"><div className="flex items-center gap-3 rounded-xl border border-[var(--nst-dashboard-border)] px-3"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Search conversations…"/></div></div>
          <div className="max-h-[650px] space-y-2 overflow-y-auto p-3 nst-overlay-scroll">{filteredThreads.map((thread) => <button key={thread.id} onClick={() => setActiveId(thread.id)} className={`w-full rounded-2xl border p-4 text-left transition ${activeId === thread.id ? 'border-[var(--nst-dashboard-primary)] bg-[color-mix(in_srgb,var(--nst-dashboard-primary)_10%,var(--nst-dashboard-surface))]' : 'border-[var(--nst-dashboard-border)] hover:border-[var(--nst-dashboard-primary)]'}`}><div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{thread.title || 'Staff Chat'}</strong>{thread.unread_count > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[var(--nst-dashboard-primary)] px-1 text-[10px] font-black text-white">{thread.unread_count}</span>}</div><p className="mt-2 truncate text-xs text-[var(--nst-dashboard-muted)]">{thread.last_message || 'No message yet'}</p></button>)}{filteredThreads.length === 0 && <p className="p-8 text-center text-sm text-[var(--nst-dashboard-muted)]">No conversation yet.</p>}</div>
        </Shell>

        <Shell className="flex min-h-[720px] flex-col overflow-hidden">
          {!activeId && <div className="grid flex-1 place-items-center p-8 text-center"><div><MessageCircle className="mx-auto text-[var(--nst-dashboard-muted)]" size={56}/><h2 className="mt-4 text-xl font-black">Choose a conversation</h2><p className="mt-2 text-sm text-[var(--nst-dashboard-muted)]">Create a direct or group staff chat.</p></div></div>}
          {activeId && <>
            <div className="flex items-center justify-between border-b border-[var(--nst-dashboard-border)] p-4"><div><h2 className="font-black">{active?.title || 'Staff Chat'}</h2><p className="text-xs text-[var(--nst-dashboard-muted)]">{presence.filter((item) => item.online).map((item) => item.name).join(', ') || 'Presence updates automatically'}</p></div><Users size={19}/></div>
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-[color-mix(in_srgb,var(--nst-dashboard-bg)_85%,transparent)] p-4 nst-overlay-scroll">{loading && <div className="grid place-items-center py-20"><RefreshCw className="animate-spin"/></div>}{!loading && messages.map((message) => <div key={message.id} className={`flex ${Number(message.sender_id) === currentUserId ? 'justify-end' : 'justify-start'}`}><div className="max-w-[82%] rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] p-3 shadow-sm"><div className="mb-1 flex items-center gap-2 text-[10px] font-black text-[var(--nst-dashboard-primary)]"><Circle size={7} fill="currentColor"/>{message.sender_name}</div>{message.body && <p className="whitespace-pre-wrap text-sm">{message.body}</p>}{(message.attachments || []).map((file, index) => <button type="button" key={index} onClick={() => dashboardOperatingService.downloadProtected(file.url, file.name).catch(() => setError('Attachment could not be downloaded.'))} className="mt-2 flex w-full items-center gap-2 rounded-xl border border-[var(--nst-dashboard-border)] p-2 text-left text-xs font-bold"><Paperclip size={14}/>{file.name}</button>)}<p className="mt-2 text-right text-[9px] text-[var(--nst-dashboard-muted)]">{new Date(message.created_at).toLocaleString('en-BD')}</p></div></div>)}{presence.some((item) => item.typing) && <p className="text-xs font-bold text-[var(--nst-dashboard-primary)]">{presence.filter((item) => item.typing).map((item) => item.name).join(', ')} typing…</p>}</div>
            <form onSubmit={send} className="border-t border-[var(--nst-dashboard-border)] p-4"><div className="flex items-end gap-2 rounded-2xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-2"><label className="cursor-pointer rounded-xl p-3 hover:bg-[var(--nst-dashboard-surface)]"><Paperclip size={19}/><input type="file" multiple className="hidden" onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0,5))}/></label><textarea value={body} onChange={(event) => type(event.target.value)} rows={2} className="min-h-[46px] flex-1 resize-none bg-transparent p-2 text-sm outline-none" placeholder="Write a message…"/><button disabled={sending} className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--nst-dashboard-primary)] text-white disabled:opacity-50"><Send size={18}/></button></div>{files.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{files.map((file, index) => <span key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-[var(--nst-dashboard-border)] px-2 py-1 text-xs">{file.name}<button type="button" onClick={() => setFiles((items) => items.filter((_, i) => i !== index))}><X size={12}/></button></span>)}</div>}</form>
          </>}
        </Shell>
      </div>
    </div>

    {newChatOpen && <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/55 p-4"><Shell className="w-full max-w-xl p-5"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Start Staff Chat</h2><p className="text-sm text-[var(--nst-dashboard-muted)]">Select one or more staff members.</p></div><button onClick={() => setNewChatOpen(false)}><X/></button></div><div className="mt-4 max-h-[430px] space-y-2 overflow-y-auto nst-overlay-scroll">{users.map((user) => <label key={user.id} className="flex cursor-pointer items-center justify-between rounded-2xl border border-[var(--nst-dashboard-border)] p-3"><div><strong className="text-sm">{user.name}</strong><p className="text-xs text-[var(--nst-dashboard-muted)]">{user.branch || 'No branch'} · {(user.roles || []).join(', ')}</p></div><input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={() => setSelectedUsers((items) => items.includes(user.id) ? items.filter((id) => id !== user.id) : [...items, user.id])}/></label>)}</div><button onClick={createThread} disabled={!selectedUsers.length} className="mt-5 w-full rounded-xl bg-[var(--nst-dashboard-primary)] py-3 text-sm font-black text-white disabled:opacity-50">Open Conversation</button></Shell></div>}
  </main>;
}
