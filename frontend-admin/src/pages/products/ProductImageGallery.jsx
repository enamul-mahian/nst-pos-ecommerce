import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Image, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { productService } from '../../services/productService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { useT } from '../../i18n';

export default function ProductImageGallery() {
  const t = useT();
  const [images, setImages] = useState([]);
  const [meta, setMeta] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const imageStats = useMemo(() => {
    const variantLinked = images.filter((item) => item.product_variant_id).length;
    const productLinked = images.filter((item) => item.product_id && !item.product_variant_id).length;
    return { total: images.length, variantLinked, productLinked };
  }, [images]);

  const loadImages = async (page = 1, customSearch = search) => {
    try {
      setLoading(true);
      setError('');
      const response = await productService.getMediaLibraryImages({ page, search: customSearch, per_page: 60 });
      const payload = response?.data || response;
      setImages(payload?.data || []);
      setMeta(payload || null);
    } catch (err) {
      console.error(err);
      setImages([]);
      setError(err?.response?.data?.message || 'Product Image Gallery load failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    loadImages(1, search);
  };

  const deletePhysical = async (item) => {
    const ok = window.confirm('Delete physical image file? Only use this when it is not linked elsewhere. Variant remove should use unlink, not physical delete.');
    if (!ok) return;

    try {
      setDeletingId(item.id);
      setMessage('');
      setError('');
      await productService.deleteMediaLibraryImage({ id: item.id, path: item.image_path });
      setMessage('Image deleted safely.');
      await loadImages(meta?.current_page || 1);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || 'Image delete failed. Unlink from variants/products first.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7fb] p-4 md:p-6">
      <div className="mb-6 overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-sm">
        <NstPageHeader actions={<><div className="flex flex-wrap gap-2">
            <Badge label="Total" value={imageStats.total} />
            <Badge label="Variant Linked" value={imageStats.variantLinked} />
            <Badge label="Product Linked" value={imageStats.productLinked} />
          </div></>} icon={Image} title={t('image_gallery.title')} subtitle={t('image_gallery.subtitle')}></NstPageHeader>

        <div className="border-t border-slate-100 p-4">
          <form onSubmit={submitSearch} className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by product, variant, SKU, image path"
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
              />
            </div>
            <button className="rounded-2xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[var(--nst-dashboard-shadow)] hover:bg-[var(--nst-dashboard-primary)]">Search</button>
            <button type="button" onClick={() => loadImages(meta?.current_page || 1)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
              <RefreshCw size={16} /> Refresh
            </button>
          </form>
        </div>
      </div>

      {message && <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-[2rem] bg-white p-10 text-center text-sm font-bold text-slate-500 shadow-sm">Loading Product Image Gallery...</div>
      ) : images.length === 0 ? (
        <div className="rounded-[2rem] bg-white p-10 text-center shadow-sm">
          <p className="text-lg font-black text-slate-900">No product images found.</p>
          <p className="mt-2 text-sm text-slate-500">Upload images from Add/Edit Product or Product Variant Operations.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {images.map((item) => (
            <div key={item.id} className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
              <div className="aspect-square bg-slate-50">
                {item.thumbnail_url || item.image_url ? (
                  <img src={item.thumbnail_url || item.image_url} alt={item.original_name || 'Product image'} className="h-full w-full object-contain p-3" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300"><Image size={44} /></div>
                )}
              </div>

              <div className="space-y-3 p-4">
                <div>
                  <p className="line-clamp-1 text-sm font-black text-slate-900">{item.product?.name || 'Unassigned Media'}</p>
                  <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{item.variant?.variant_name || item.variant_key || item.original_name || '-'}</p>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] font-black">
                  <span className="rounded-full bg-[var(--nst-dashboard-primary-soft)] px-2 py-1 text-[var(--nst-dashboard-primary)]">ID #{item.id}</span>
                  {item.product_variant_id ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Variant</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Product</span>}
                  {item.is_primary && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Primary</span>}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  {item.product_id ? (
                    <Link to={`/products/${item.product_id}/variant-operations`} className="text-xs font-black text-[var(--nst-dashboard-primary)] hover:underline">Open Variant Ops</Link>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400">No product link</span>
                  )}
                  <button type="button" onClick={() => deletePhysical(item)} disabled={deletingId === item.id} className="inline-flex items-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100 disabled:opacity-50">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {meta && meta.last_page > 1 && (
        <div className="mt-6 flex items-center justify-between rounded-2xl bg-white p-4 text-sm font-bold text-slate-600 shadow-sm">
          <button disabled={meta.current_page === 1} onClick={() => loadImages(meta.current_page - 1)} className="rounded-xl border px-4 py-2 disabled:opacity-50">Previous</button>
          <span>Page {meta.current_page} of {meta.last_page}</span>
          <button disabled={meta.current_page === meta.last_page} onClick={() => loadImages(meta.current_page + 1)} className="rounded-xl border px-4 py-2 disabled:opacity-50">Next</button>
        </div>
      )}

      <div className="mt-6 rounded-3xl border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] p-5 text-sm text-[var(--nst-dashboard-primary)]">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 flex-shrink-0" size={20} />
          <div>
            <p className="font-black">Safe rule</p>
            <p className="mt-1 font-semibold">Variant image remove = unlink only. Physical delete is separate and protected because one image can be reused by multiple variants.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ label, value }) {
  return (
    <div className="rounded-2xl border border-white bg-white/80 px-4 py-3 text-center shadow-sm">
      <p className="text-lg font-black text-slate-950">{value}</p>
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
