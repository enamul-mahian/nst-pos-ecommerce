import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ImagePlus, Layers, RefreshCw, Trash2, Upload } from 'lucide-react';
import { productService } from '../../services/productService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { useT } from '../../i18n';

const emptyVariant = {
  id: null,
  product_id: '',
  variant_name: '',
  color_name: '',
  region: '',
  sim_network: '',
  ram: '',
  storage: '',
  condition: 'new',
  sku: '',
  barcode_mode: 'auto',
  barcode: '',
  purchase_price: '0',
  sale_price: '0',
  market_price: '',
  regular_price: '',
  discount_price: '',
  stock_quantity: '0',
  low_stock_alert: '5',
  warranty: '',
  status: 'active',
};

export default function ProductVariantMatrix() {
  const t = useT();
  const { id } = useParams();
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(id || '');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [selectedGalleryIds, setSelectedGalleryIds] = useState([]);
  const [activeVariantId, setActiveVariantId] = useState(null);
  const [form, setForm] = useState(emptyVariant);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingVariantId, setUploadingVariantId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const currentProductId = selectedProductId || id || '';

  const activeVariant = useMemo(() => {
    return variants.find((variant) => String(variant.id) === String(activeVariantId)) || variants[0] || null;
  }, [activeVariantId, variants]);

  const loadProducts = async () => {
    const response = await productService.getProducts({ per_page: 500 });
    const list = response?.data?.data || [];
    setProducts(list);
    if (!currentProductId && list[0]?.id) {
      setSelectedProductId(String(list[0].id));
    }
  };

  const loadProduct = async (productId) => {
    if (!productId) return;
    try {
      setLoading(true);
      setError('');
      const response = await productService.getVariantImageMatrix(productId);
      const data = response?.data || {};
      const product = data.product || null;
      const variantList = Array.isArray(data.variants) ? data.variants : [];
      setSelectedProduct(product);
      setVariants(variantList);
      setActiveVariantId((previous) => previous || variantList[0]?.id || null);
      setForm((previous) => ({
        ...emptyVariant,
        product_id: productId,
        condition: product?.condition || 'new',
        purchase_price: product?.purchase_price || '0',
        sale_price: product?.sale_price || '0',
        market_price: product?.market_price || '',
        warranty: product?.warranty || '',
      }));
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || 'Product Variant Operations load failed.');
    } finally {
      setLoading(false);
    }
  };

  const loadGallery = async () => {
    try {
      const response = await productService.getMediaLibraryImages({ per_page: 80 });
      const payload = response?.data || response;
      setGallery(payload?.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadProducts();
    loadGallery();
  }, []);

  useEffect(() => {
    if (currentProductId) {
      loadProduct(currentProductId);
    }
  }, [currentProductId]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const resetForm = () => {
    setForm({
      ...emptyVariant,
      product_id: currentProductId,
      condition: selectedProduct?.condition || 'new',
      purchase_price: selectedProduct?.purchase_price || '0',
      sale_price: selectedProduct?.sale_price || '0',
      warranty: selectedProduct?.warranty || '',
    });
  };

  const editVariant = (variant) => {
    setForm({
      ...emptyVariant,
      ...variant,
      product_id: currentProductId,
      color_name: variant.color_name || variant.color || '',
      region: variant.region || variant.region_variant || '',
      sim_network: variant.sim_network || '',
      ram: variant.ram || '',
      storage: variant.storage || '',
      purchase_price: variant.purchase_price || '0',
      sale_price: variant.sale_price || '0',
      market_price: variant.market_price || '',
      regular_price: variant.regular_price || '',
      discount_price: variant.discount_price || '',
      stock_quantity: variant.stock_quantity || '0',
      low_stock_alert: variant.low_stock_alert || '5',
      barcode_mode: variant.barcode_mode || 'auto',
      status: variant.status || 'active',
    });
    setActiveVariantId(variant.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveVariant = async (event) => {
    event.preventDefault();
    if (!currentProductId) {
      setError('Please select product first.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');

      const payload = {
        ...form,
        product_id: Number(currentProductId),
        purchase_price: Number(form.purchase_price || 0),
        sale_price: Number(form.sale_price || 0),
        market_price: form.market_price === '' ? null : Number(form.market_price || 0),
        regular_price: form.regular_price === '' ? null : Number(form.regular_price || 0),
        discount_price: form.discount_price === '' ? null : Number(form.discount_price || 0),
        stock_quantity: Number(form.stock_quantity || 0),
        low_stock_alert: Number(form.low_stock_alert || 0),
      };

      if (form.id) {
        await productService.updateVariant(form.id, payload);
        setMessage('Variant updated successfully.');
      } else {
        await productService.createVariant(payload);
        setMessage('Variant created successfully.');
      }

      resetForm();
      await loadProduct(currentProductId);
    } catch (err) {
      console.error(err);
      const errors = err?.response?.data?.errors;
      setError(errors ? Object.values(errors).flat().join(' ') : err?.response?.data?.message || 'Variant save failed.');
    } finally {
      setSaving(false);
    }
  };

  const deleteVariant = async (variant) => {
    if (!window.confirm(`Delete/inactivate variant ${variantLabel(variant)}?`)) return;
    try {
      await productService.deleteVariant(variant.id);
      setMessage('Variant deleted successfully.');
      await loadProduct(currentProductId);
    } catch (err) {
      setError(err?.response?.data?.message || 'Variant delete failed. If this variant has stock/device history, make it inactive instead.');
    }
  };

  const uploadImages = async (variant, files) => {
    if (!files?.length) return;
    try {
      setUploadingVariantId(variant.id);
      setError('');
      setMessage('');
      const formData = new FormData();
      Array.from(files).slice(0, 5).forEach((file) => formData.append('images[]', file));
      await productService.uploadVariantImages(variant.id, formData);
      setMessage('Variant image uploaded and saved.');
      await Promise.all([loadProduct(currentProductId), loadGallery()]);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || 'Variant image upload failed.');
    } finally {
      setUploadingVariantId(null);
    }
  };

  const unlinkImage = async (variant, image) => {
    if (!window.confirm('Unlink this image from variant? Physical file will stay in gallery.')) return;
    try {
      await productService.unlinkVariantImages(variant.id, [image.id]);
      setMessage('Image unlinked from variant. Physical file was not deleted.');
      await loadProduct(currentProductId);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || 'Image unlink failed.');
    }
  };

  const toggleGallery = (imageId) => {
    setSelectedGalleryIds((previous) => previous.includes(imageId) ? previous.filter((id) => id !== imageId) : [...previous, imageId]);
  };

  const linkSelectedGallery = async () => {
    if (!activeVariant?.id) {
      setError('Select a variant first.');
      return;
    }
    if (selectedGalleryIds.length === 0) {
      setError('Select at least one gallery image.');
      return;
    }

    try {
      setError('');
      setMessage('');
      await productService.linkImagesToVariant(activeVariant.id, selectedGalleryIds);
      setSelectedGalleryIds([]);
      setMessage('Selected gallery image linked to variant.');
      await loadProduct(currentProductId);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || 'Gallery image link failed.');
    }
  };

  const variantLabel = (variant) => {
    return variant?.display_name || variant?.variant_name || [variant?.color_name || variant?.color, variant?.region, variant?.storage, variant?.ram, variant?.sim_network].filter(Boolean).join(' / ') || 'Default Variant';
  };

  return (
    <div className="min-h-screen bg-[#f7f7fb] p-4 md:p-6">
      <NstPageHeader actions={<><div className="flex flex-wrap gap-2">
            <Link to="/products/image-gallery" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-[var(--nst-dashboard-primary)] shadow-sm hover:bg-[var(--nst-dashboard-primary-soft)]">Product Image Gallery</Link>
            <Link to="/products" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50">Back to Products</Link>
          </div></>} icon={Layers} title={t('variants.title')} subtitle={t('variants.subtitle')} />

      {message && <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <div className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Select Product</label>
        <select value={currentProductId} onChange={(event) => { setSelectedProductId(event.target.value); setActiveVariantId(null); }} className={inputClass()}>
          <option value="">Select product</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name} {product.sku ? `(${product.sku})` : ''}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[420px_1fr_360px]">
        <form onSubmit={saveVariant} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="mb-1 text-lg font-black text-slate-950">{form.id ? 'Edit Variant' : 'Add Variant'}</h2>
          <p className="mb-5 text-sm text-slate-500">Colour-wise/variant-wise price problem will be solved here.</p>

          <div className="space-y-4">
            <Input label="Color" name="color_name" value={form.color_name} onChange={handleChange} placeholder="Natural Titanium / Blue" />
            <Input label="Region / Variant" name="region" value={form.region} onChange={handleChange} placeholder="Global / JP / HK" />
            <Input label="SIM Network" name="sim_network" value={form.sim_network} onChange={handleChange} placeholder="Single SIM / Dual SIM" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="RAM" name="ram" value={form.ram} onChange={handleChange} placeholder="8GB / 12GB" />
              <Input label="Storage" name="storage" value={form.storage} onChange={handleChange} placeholder="128GB / 256GB" />
            </div>
            <Input label="Variant Name" name="variant_name" value={form.variant_name} onChange={handleChange} placeholder="Auto from combination if empty" />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="SKU" name="sku" value={form.sku} onChange={handleChange} placeholder="Auto if empty" />
              <div>
                <label className={labelClass()}>Barcode Mode</label>
                <select name="barcode_mode" value={form.barcode_mode} onChange={handleChange} className={inputClass()}>
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </div>

            <Input label="Variant Barcode" name="barcode" value={form.barcode} onChange={handleChange} placeholder="Auto if empty" />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="Purchase Price" name="purchase_price" type="number" value={form.purchase_price} onChange={handleChange} />
              <Input label="Sale Price" name="sale_price" type="number" value={form.sale_price} onChange={handleChange} />
              <Input label="Market Price" name="market_price" type="number" value={form.market_price} onChange={handleChange} />
              <Input label="Regular Price" name="regular_price" type="number" value={form.regular_price} onChange={handleChange} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="Stock Count" name="stock_quantity" type="number" value={form.stock_quantity} onChange={handleChange} />
              <Input label="Low Stock Alert" name="low_stock_alert" type="number" value={form.low_stock_alert} onChange={handleChange} />
            </div>

            <Input label="Warranty" name="warranty" value={form.warranty} onChange={handleChange} placeholder="Official / Shop / No Warranty" />

            <div>
              <label className={labelClass()}>Status</label>
              <select name="status" value={form.status} onChange={handleChange} className={inputClass()}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button type="submit" disabled={saving || !currentProductId} className="rounded-2xl bg-[var(--nst-dashboard-primary)] px-5 py-3 text-sm font-black text-white hover:bg-[#7c2fd0] disabled:opacity-60">{saving ? 'Saving...' : form.id ? 'Update Variant' : 'Create Variant'}</button>
              {form.id && <button type="button" onClick={resetForm} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-200">Cancel Edit</button>}
            </div>
          </div>
        </form>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Variant List + Image Slots</h2>
              <p className="text-sm text-slate-500">Product total stock = all variant stock. Customer price depends on selected variant combination.</p>
            </div>
            <button type="button" onClick={() => currentProductId && loadProduct(currentProductId)} className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"><RefreshCw size={16} /> Refresh</button>
          </div>

          {loading ? <div className="p-8 text-center text-slate-500">Loading variants...</div> : variants.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">No variants yet. Create first variant from the form.</div>
          ) : (
            <div className="space-y-4">
              {variants.map((variant) => (
                <div key={variant.id} className={`rounded-3xl border p-4 transition ${String(activeVariant?.id) === String(variant.id) ? 'border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)]' : 'border-slate-100 bg-white'}`}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex-1">
                      <button type="button" onClick={() => setActiveVariantId(variant.id)} className="text-left">
                        <p className="text-base font-black text-slate-950">{variantLabel(variant)}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">SKU: {variant.sku || '-'} | Barcode: {variant.barcode || '-'} | Stock: {variant.stock_quantity || 0}</p>
                        <p className="mt-1 text-sm font-black text-emerald-700">BDT {Number(variant.sale_price || 0).toLocaleString()}</p>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => editVariant(variant)} className="rounded-xl bg-[var(--nst-dashboard-primary-soft)] px-3 py-2 text-xs font-black text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)]">Edit</button>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100">
                        <Upload size={14} /> {uploadingVariantId === variant.id ? 'Uploading...' : 'Upload Images'}
                        <input type="file" multiple accept="image/*" className="hidden" onChange={(event) => uploadImages(variant, event.target.files)} />
                      </label>
                      <button type="button" onClick={() => deleteVariant(variant)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100">Delete</button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {(variant.images || []).map((image) => (
                      <div key={image.id} className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white">
                        <div className="aspect-square bg-slate-50">
                          <img src={image.thumbnail_url || image.image_url} alt={image.original_name || 'Variant image'} className="h-full w-full object-contain p-2" />
                        </div>
                        <button type="button" onClick={() => unlinkImage(variant, image)} className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-red-600 opacity-100 shadow hover:bg-red-50 lg:opacity-0 lg:group-hover:opacity-100" title="Unlink only">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 5 - (variant.images?.length || 0)) }).map((_, index) => (
                      <label key={`slot-${variant.id}-${index}`} className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs font-bold text-slate-400 hover:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] hover:bg-[var(--nst-dashboard-primary-soft)] hover:text-[var(--nst-dashboard-primary)]">
                        <ImagePlus size={22} />
                        <span className="mt-2">Add Image</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadImages(variant, event.target.files)} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="text-lg font-black text-slate-950">Link From Gallery</h2>
          <p className="mt-1 text-sm text-slate-500">Selected variant: <span className="font-black text-[var(--nst-dashboard-primary)]">{activeVariant ? variantLabel(activeVariant) : 'None'}</span></p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Gallery link will not duplicate physical file.</p>

          <button type="button" onClick={linkSelectedGallery} className="mt-4 w-full rounded-2xl bg-[var(--nst-dashboard-primary)] px-4 py-3 text-sm font-black text-white hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60" disabled={!activeVariant || selectedGalleryIds.length === 0}>Link Selected Images ({selectedGalleryIds.length})</button>

          <div className="mt-4 max-h-[700px] space-y-3 overflow-y-auto pr-1">
            {gallery.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">No gallery images yet.</div>
            ) : gallery.map((item) => (
              <button key={item.id} type="button" onClick={() => toggleGallery(item.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition ${selectedGalleryIds.includes(item.id) ? 'border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)]' : 'border-slate-100 bg-white hover:bg-slate-50'}`}>
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-slate-50">
                  {item.thumbnail_url || item.image_url ? <img src={item.thumbnail_url || item.image_url} alt="Gallery" className="h-full w-full object-contain p-1" /> : <div className="flex h-full items-center justify-center text-slate-300"><ImagePlus size={20} /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-slate-800">{item.product?.name || item.original_name || 'Media'}</p>
                  <p className="truncate text-[11px] font-semibold text-slate-500">{item.variant?.variant_name || item.image_path || '-'}</p>
                  <p className="mt-1 text-[10px] font-black text-[var(--nst-dashboard-primary)]">ID #{item.id}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div>
      <label className={labelClass()}>{label}</label>
      <input {...props} className={inputClass()} />
    </div>
  );
}

function labelClass() {
  return 'mb-1 block text-xs font-black uppercase tracking-wide text-slate-500';
}

function inputClass() {
  return 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]';
}
