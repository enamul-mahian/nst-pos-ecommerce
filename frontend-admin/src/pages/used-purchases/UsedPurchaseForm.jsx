import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import usedPurchaseService from '../../services/usedPurchaseService';
import api from '../../services/api';
import BdMoneyInput from '../../components/BdMoneyInput';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { RotateCcw as NstHdrRotateCcw } from 'lucide-react';
import { useT } from '../../i18n';

const UsedPurchaseForm = () => {
  const t = useT();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const emptyProductImageSlots = [null, null, null, null, null];

  const [formData, setFormData] = useState({
    purchase_type: 'used',
    seller_type: 'customer',
    customer_id: '',
    supplier_id: '',
    branch_id: '',
    salesman_id: '',
    customer_name: '',
    customer_phone: '',
    product_name: '',
    brand_id: '',
    brand: '',
    model: '',
    imei_1: '',
    imei_2: '',
    battery_health: '',
    purchase_price: '',
    ready_sale_price: '',
    condition: 'good',
    status: 'purchased',
    notes: '',
  });

  const [branches, setBranches] = useState([]);
  const [brands, setBrands] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [productImageSlots, setProductImageSlots] = useState(emptyProductImageSlots);
  const [existingImages, setExistingImages] = useState({ product_images: [] });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');

  const getBackendBaseUrl = () => {
    const baseURL = api?.defaults?.baseURL || 'http://localhost:8000/api';
    return baseURL.replace(/\/api\/?$/, '');
  };

  const getFileUrl = (url) => {
    if (!url) return '';
    if (String(url).startsWith('http')) return url;
    return `${getBackendBaseUrl()}${url}`;
  };

  const getErrorMessage = (err) => {
    if (err?.response?.data?.errors) {
      return Object.values(err.response.data.errors).flat().join(' ');
    }
    return err?.response?.data?.message || err?.message || 'Something went wrong.';
  };

  const fetchOptions = async () => {
    try {
      const response = await usedPurchaseService.getOptions();
      const data = response?.data?.data || response?.data || {};
      setBranches(Array.isArray(data.branches) ? data.branches : []);
      setBrands(Array.isArray(data.brands) ? data.brands : []);
      setSalesmen(Array.isArray(data.salesmen) ? data.salesmen : []);
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
      setSuppliers(Array.isArray(data.suppliers) ? data.suppliers : []);
    } catch (err) {
      console.error('Options Load Error:', err);
      setError(t('used_purchases.errors.options_load_failed'));
    }
  };

  const fetchUsedPurchase = async () => {
    if (!isEditMode) return;
    try {
      setFetching(true);
      setError('');
      const response = await usedPurchaseService.getUsedPurchase(id);
      const data = response?.data?.data || response?.data || {};
      setFormData({
        purchase_type: data.purchase_type || 'used',
        seller_type: data.seller_type || 'customer',
        customer_id: data.customer_id || '',
        supplier_id: data.supplier_id || '',
        branch_id: data.branch_id || '',
        salesman_id: data.salesman_id || '',
        customer_name: data.customer_name || '',
        customer_phone: data.customer_phone || '',
        product_name: data.product_name || '',
        brand_id: data.brand_id || '',
        brand: data.brandInfo?.name || data.brand_info?.name || data.brand || '',
        model: data.model || '',
        imei_1: data.imei_1 || '',
        imei_2: data.imei_2 || '',
        battery_health: data.battery_health ?? '',
        purchase_price: data.purchase_price || '',
        ready_sale_price: data.ready_sale_price || '',
        condition: data.condition || 'good',
        status: data.status || 'purchased',
        notes: data.notes || '',
      });
      setBrandSearch(data.brandInfo?.name || data.brand_info?.name || data.brand || '');
      const paths = Array.isArray(data.product_image_paths) ? data.product_image_paths : [];
      const urls = Array.isArray(data.product_image_urls) ? data.product_image_urls : [];
      setExistingImages({
        product_images: paths.map((path, index) => ({ path, url: urls[index] || '' })),
      });
    } catch (err) {
      console.error('Used Purchase Fetch Error:', err);
      setError(getErrorMessage(err));
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchOptions();
    fetchUsedPurchase();
  }, [id]);

  const filteredBrands = useMemo(() => {
    if (!brandSearch) return brands;
    return brands.filter((brand) => String(brand.name || '').toLowerCase().includes(brandSearch.toLowerCase()));
  }, [brands, brandSearch]);

  const totalProductImageCount = existingImages.product_images.length + productImageSlots.filter(Boolean).length;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((previousData) => ({ ...previousData, [name]: value }));
  };

  const handleSellerTypeChange = (e) => {
    const value = e.target.value;
    setFormData((previous) => ({
      ...previous,
      seller_type: value,
      customer_id: '',
      supplier_id: '',
      customer_name: '',
      customer_phone: '',
      }));
  };

  const handleCustomerSelect = (e) => {
    const value = e.target.value;
    const customer = customers.find((item) => String(item.id) === String(value));
    setFormData((previous) => ({
      ...previous,
      customer_id: value,
      supplier_id: '',
      customer_name: customer?.name || previous.customer_name,
      customer_phone: customer?.phone || '',
    }));
  };

  const handleSupplierSelect = (e) => {
    const value = e.target.value;
    const supplier = suppliers.find((item) => String(item.id) === String(value));
    setFormData((previous) => ({
      ...previous,
      supplier_id: value,
      customer_id: '',
      customer_name: supplier?.name || previous.customer_name,
      customer_phone: supplier?.phone || '',
    }));
  };

  const handleBrandSearchChange = (e) => {
    const value = e.target.value;
    setBrandSearch(value);
    setShowBrandDropdown(true);
    setFormData((previousData) => ({ ...previousData, brand_id: '', brand: value }));
  };

  const handleBrandSelect = (brand) => {
    setFormData((previousData) => ({ ...previousData, brand_id: brand.id, brand: brand.name }));
    setBrandSearch(brand.name);
    setShowBrandDropdown(false);
  };

  const handleProductImageSlotChange = (slotIndex, file) => {
    const nextSlots = [...productImageSlots];
    nextSlots[slotIndex] = file || null;
    const nextTotalCount = existingImages.product_images.length + nextSlots.filter(Boolean).length;
    if (nextTotalCount > 5) {
      setError('Maximum 5 product images allowed.');
      return;
    }
    setError('');
    setProductImageSlots(nextSlots);
  };

  const removeProductImageSlot = (slotIndex) => {
    const nextSlots = [...productImageSlots];
    nextSlots[slotIndex] = null;
    setProductImageSlots(nextSlots);
  };

  const removeExistingProductImage = (path) => {
    setExistingImages((previous) => ({ ...previous, product_images: previous.product_images.filter((image) => image.path !== path) }));
  };

  const makeFormDataPayload = () => {
    const payload = new FormData();
    Object.entries(formData).forEach(([key, value]) => payload.append(key, value === null || value === undefined ? '' : value));
    payload.append('battery_health', formData.battery_health === '' ? '' : String(formData.battery_health));
    payload.append('purchase_price', String(Number(formData.purchase_price || 0)));
    payload.append('keep_product_image_paths', JSON.stringify(existingImages.product_images.map((image) => image.path)));
    productImageSlots.filter(Boolean).forEach((file) => payload.append('product_images[]', file));
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (totalProductImageCount > 5) {
      setError('Maximum 5 product images allowed.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const payload = makeFormDataPayload();
      if (isEditMode) await usedPurchaseService.updateUsedPurchase(id, payload);
      else await usedPurchaseService.createUsedPurchase(payload);
      navigate('/used-purchase');
    } catch (err) {
      console.error('Used Purchase Save Error:', err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="p-6"><div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">Loading used purchase data...</div></div>;
  }

  return (
    <div className="p-6">
      <NstPageHeader icon={NstHdrRotateCcw} title={isEditMode ? t('used_purchases.edit_title') : t('used_purchases.add_title')} subtitle={t('used_purchases.form_subtitle')} actions={<><Link to="/used-purchase" className="inline-flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200">Back to List</Link></>}/>

      <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">SELLER TYPE CUSTOMER/SUPPLIER VERSION LOADED</div>
      {error && <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <SectionTitle title="Purchase Basic Information" subtitle={t('used_purchases.basic_info_subtitle')} />
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-5 mb-8">
          <SelectField label="Purchase Type *" name="purchase_type" value={formData.purchase_type} onChange={handleChange} required options={[['used', 'Used'], ['pre_owned', 'Pre-Owned']]} />
          <SelectField label="Seller Type *" name="seller_type" value={formData.seller_type} onChange={handleSellerTypeChange} required options={[['customer', 'Customer'], ['supplier', 'Supplier']]} />

          {formData.seller_type === 'customer' ? (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Select Customer</label>
              <select name="customer_id" value={formData.customer_id} onChange={handleCustomerSelect} className={inputClass()}>
                <option value="">New Customer from below info</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} {customer.phone ? `(${customer.phone})` : ''}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Select Supplier</label>
              <select name="supplier_id" value={formData.supplier_id} onChange={handleSupplierSelect} className={inputClass()}>
                <option value="">New Supplier from below info</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} {supplier.phone ? `(${supplier.phone})` : ''}</option>)}
              </select>
            </div>
          )}

          <SelectField label="Purchase Branch *" name="branch_id" value={formData.branch_id} onChange={handleChange} required options={branches.map((branch) => [branch.id, `${branch.name}${branch.code ? ` (${branch.code})` : ''}`])} placeholder="Select Branch" />
          <SelectField label="Assign Salesman *" name="salesman_id" value={formData.salesman_id} onChange={handleChange} required options={salesmen.map((salesman) => [salesman.id, `${salesman.name}${salesman.email ? ` (${salesman.email})` : ''}`])} placeholder="Select Salesman" />
          <SelectField label="Status" name="status" value={formData.status} onChange={handleChange} options={[['purchased', 'Purchased'], ['ready_for_sale', 'Ready For Sale'], ['sold', 'Sold'], ['returned', 'Returned'], ['cancelled', 'Cancelled']]} />
        </div>

        <SectionTitle title="Seller Information" subtitle={t('used_purchases.seller_info_subtitle')} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <InputField label="Seller Name *" name="customer_name" value={formData.customer_name} onChange={handleChange} required placeholder="Example: Md Rahim" />
          <InputField label="Seller Phone" name="customer_phone" value={formData.customer_phone} onChange={handleChange} placeholder="017xxxxxxxx" />
        </div>

        <SectionTitle title="Product Information" subtitle="Enter device identity, NST buying price and optional planned sale price. Final sale price is confirmed before Ready for Sale." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <InputField label="Product Name *" name="product_name" value={formData.product_name} onChange={handleChange} required placeholder="Example: iPhone 13 Pro" />

          <div className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Brand Name</label>
            <input type="text" value={brandSearch} onChange={handleBrandSearchChange} onFocus={() => setShowBrandDropdown(true)} placeholder="Search brand..." className={inputClass()} />
            {showBrandDropdown && (
              <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {filteredBrands.length === 0 ? <button type="button" onClick={() => setShowBrandDropdown(false)} className="w-full px-4 py-3 text-left text-sm text-gray-500">No brand found</button> : filteredBrands.map((brand) => (
                  <button key={brand.id} type="button" onClick={() => handleBrandSelect(brand)} className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-[var(--nst-dashboard-primary-soft)]">{brand.name}</button>
                ))}
              </div>
            )}
          </div>

          <InputField label="Model" name="model" value={formData.model} onChange={handleChange} />
          <InputField label="IMEI 1" name="imei_1" value={formData.imei_1} onChange={handleChange} />
          <InputField label="IMEI 2" name="imei_2" value={formData.imei_2} onChange={handleChange} />
          <InputField label="Battery Health (%)" name="battery_health" type="number" min="0" max="100" value={formData.battery_health} onChange={handleChange} />
          <InputField label="Purchase / Buying Price *" name="purchase_price" money value={formData.purchase_price} onChange={handleChange} required placeholder={t('used_purchases.purchase_price_placeholder')} />
          <InputField label="Planned Sale Price" name="ready_sale_price" money value={formData.ready_sale_price} onChange={handleChange} placeholder="Optional now; confirm or adjust before Ready for Sale" />
          <SelectField label="Condition" name="condition" value={formData.condition} onChange={handleChange} options={[['excellent', 'Excellent'], ['good', 'Good'], ['fair', 'Fair'], ['poor', 'Poor'], ['damaged', 'Damaged']]} />
          <div className="md:col-span-3">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows="4" placeholder="Device condition, accessories, problem, warranty note etc." className={inputClass()} />
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] p-5">
          <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">Product Image Upload - Optional</h2>
          <p className="mb-5 text-sm text-gray-500">Only device/product images are accepted. Seller photo, NID photo, fingerprint and biometric data are not collected in this workflow.</p>

          <div className="rounded-lg bg-white p-4 border border-gray-100">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--nst-dashboard-text)]">Product Images - Max 5</h3>
                <p className="text-xs text-gray-400">{t('used_purchases.images_help')}</p>
              </div>
              <span className="rounded-full bg-[var(--nst-dashboard-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--nst-dashboard-primary)]">{totalProductImageCount}/5</span>
            </div>

            {isEditMode && existingImages.product_images.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold text-gray-600">Existing Product Images</p>
                <div className="flex flex-wrap gap-2">
                  {existingImages.product_images.map((image, index) => (
                    <div key={image.path} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                      <a href={getFileUrl(image.url)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 hover:underline">Image {index + 1}</a>
                      <button type="button" onClick={() => removeExistingProductImage(image.path)} className="text-xs font-semibold text-red-600 hover:underline">Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {productImageSlots.map((file, index) => (
                <div key={index} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <label className="mb-2 block text-xs font-semibold text-gray-700">Product Image {index + 1}</label>
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => handleProductImageSlotChange(index, e.target.files?.[0] || null)} className="w-full text-xs" />
                  {file && <div className="mt-2"><p className="truncate text-xs text-gray-500">{file.name}</p><button type="button" onClick={() => removeProductImageSlot(index)} className="mt-1 text-xs font-semibold text-red-600 hover:underline">Remove</button></div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:justify-end">
          <Link to="/used-purchase" className="inline-flex items-center justify-center rounded-lg bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200">Cancel</Link>
          <button type="submit" disabled={loading} className="inline-flex items-center justify-center rounded-lg bg-[var(--nst-dashboard-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-primary)] disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Saving...' : isEditMode ? 'Update Used / Pre-Owned Purchase' : 'Save Used / Pre-Owned Purchase'}</button>
        </div>
      </form>
    </div>
  );
};

function SectionTitle({ title, subtitle }) {
  return <div className="mb-6"><h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">{title}</h2><p className="text-sm text-gray-400">{subtitle}</p></div>;
}

function InputField({ label, name, value, onChange, type = 'text', money = false, required = false, placeholder = '', ...rest }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
      {money ? (
        <BdMoneyInput
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          className={inputClass()}
          {...rest}
        />
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          className={inputClass()}
          {...rest}
        />
      )}
    </div>
  );
}

function SelectField({ label, name, value, onChange, options, required = false, placeholder = '' }) {
  return <div><label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label><select name={name} value={value} onChange={onChange} required={required} className={inputClass()}>{placeholder && <option value="">{placeholder}</option>}{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></div>;
}

function inputClass() {
  return 'w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]';
}

export default UsedPurchaseForm;
