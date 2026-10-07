import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import googlePostService from '../../services/googlePostService';
import api from '../../services/api';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { MapPin as NstHdrMapPin } from 'lucide-react';
import { useT } from '../../i18n';

const statusClass = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-blue-50 text-blue-700',
  published: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
};

export default function GooglePostList() {
  const t = useT();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [googleBusiness, setGoogleBusiness] = useState(null);

  const loadPosts = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await googlePostService.list();
      const data = response?.data?.data || response?.data || [];
      setPosts(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || t('google_posts.errors.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
    api.get('/google-business/status').then((response) => setGoogleBusiness(response?.data?.data || null)).catch(() => setGoogleBusiness({ status: 'not_configured', message: 'Google Business status is unavailable.' }));
  }, []);

  const deletePost = async (post) => {
    if (!window.confirm(`Delete Google Post: ${post.title}?`)) return;
    try {
      await googlePostService.delete(post.id);
      await loadPosts();
    } catch (err) {
      setError(err?.response?.data?.message || t('google_posts.errors.delete_failed'));
    }
  };

  const connectGoogle = async () => {
    try { const response = await api.get('/google-business/authorize'); window.location.assign(response.data.data.authorization_url); }
    catch (err) { setError(err?.response?.data?.message || 'Google Business OAuth is not configured.'); }
  };

  const disconnectGoogle = async () => { await api.delete('/google-business/connection'); setGoogleBusiness({ configured: true, connected: false, status: 'ready_for_oauth', message: 'Google Business disconnected.' }); };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <NstPageHeader icon={NstHdrMapPin} title={<>Google Posts</>} subtitle={<>API-ready post management for POS, eCommerce frontend and future Google Business integration.</>} actions={<><Link to="/google-posts/create" className="rounded-xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white hover:bg-[var(--nst-dashboard-primary)]">
          Add Google Post
        </Link></>}/>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {googleBusiness && <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold ${googleBusiness.configured ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><span><strong>Google Business: {googleBusiness.connected ? 'Connected' : googleBusiness.configured ? 'Ready for secure OAuth' : 'Not configured'}</strong><span className="ml-2 font-semibold">{googleBusiness.message}</span></span>{googleBusiness.configured && !googleBusiness.connected && <button type="button" onClick={connectGoogle} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-white">Connect account</button>}{googleBusiness.connected && <button type="button" onClick={disconnectGoogle} className="rounded-lg border border-emerald-700 px-3 py-1.5">Disconnect</button>}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Feature</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Sync</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={7}>Loading...</td></tr>
              ) : posts.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={7}>No Google Post found.</td></tr>
              ) : posts.map((post) => (
                <tr key={post.id} className="hover:bg-[var(--nst-dashboard-primary-soft)]">
                  <td className="px-4 py-3">
                    {post.feature_image_url ? (
                      <img src={post.feature_image_url} alt={post.title} className="h-14 w-20 rounded-xl object-cover" />
                    ) : <span className="text-slate-400">No image</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-900">{post.title}</p>
                    <p className="mt-1 line-clamp-2 max-w-md text-xs text-slate-500">{post.description}</p>
                  </td>
                  <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass[post.status] || statusClass.draft}`}>{post.status}</span></td>
                  <td className="px-4 py-3 text-slate-500">{post.scheduled_at || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{post.sync_status || 'pending'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {post.external_reference_url ? <a className="font-bold text-[var(--nst-dashboard-primary)]" href={post.external_reference_url} target="_blank" rel="noreferrer">Open</a> : '—'}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link to={`/google-posts/${post.id}/edit`} className="rounded-lg bg-[var(--nst-dashboard-primary-soft)] px-3 py-2 font-bold text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)]">Edit</Link>
                    <button type="button" onClick={() => deletePost(post)} className="rounded-lg bg-red-50 px-3 py-2 font-bold text-red-600 hover:bg-red-100">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
