import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import purchaseService from '../../services/purchaseService';
import { localDateString } from '../../utils/localDate';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { ShoppingBag as NstHdrShoppingBag } from 'lucide-react';
import { useT } from '../../i18n';

const emptyForm = {
  supplier_id: '',
  branch_id: '',
  purchase_no: '',
  purchase_date: localDateString(),
  supplier_invoice_number: '',
  supplier_invoice_date: '',
  paid_amount: '0',
  payment_method: 'cash',
  transaction_id: '',
  status: 'completed',
  note: '',
};

const emptyItemForm = {
  product_id: '',
  product_variant_id: '',
  quantity: '1',
  unit_cost: '',
  track_imei: true,
  note: '',
};

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'upay', label: 'Upay' },
  { value: 'card', label: 'Card' },
  { value: 'other_mfs', label: 'Other MFS' },
];

export default function PurchaseForm() {
  const t = useT();
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyForm);
  const [supplierInvoiceFile, setSupplierInvoiceFile] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);

  const [suppliers, setSuppliers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);

  const [scanCode, setScanCode] = useState('');

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Keep price fields visible until the /me API has loaded.
  const canViewPurchasePrice = currentUser ? canSeePurchasePrice(currentUser) : true;

  const subtotal = useMemo(() => {
    return items.reduce((total, item) => total + Number(item.line_total || 0), 0);
  }, [items]);

  const selectedSupplier = suppliers.find(
    (supplier) => String(getSupplierId(supplier)) === String(form.supplier_id)
  );

  const selectedProduct = products.find(
    (product) => String(getProductId(product)) === String(itemForm.product_id)
  );

  const selectedProductVariants = Array.isArray(selectedProduct?.variants) ? selectedProduct.variants : [];

  const selectedVariant = selectedProductVariants.find(
    (variant) => String(variant.id) === String(itemForm.product_variant_id)
  );

  const paidAmount = Number(form.paid_amount || 0);
  const dueBeforeAdvance = Math.max(subtotal - paidAmount, 0);
  const supplierAdvance = Number(
    selectedSupplier?.advance_balance ??
      selectedSupplier?.total_advance_amount ??
      0
  );
  const possibleAdvanceAdjust = Math.min(supplierAdvance, dueBeforeAdvance);
  const finalDueAfterAdvance = Math.max(dueBeforeAdvance - possibleAdvanceAdjust, 0);

  const getErrorMessage = (err, fallback = 'Something went wrong.') => {
    if (err?.response?.data?.errors) {
      return Object.values(err.response.data.errors).flat().join(' ');
    }

    return err?.response?.data?.message || err?.message || fallback;
  };

  const extractList = (response) => {
    const payload = response?.data ?? response ?? {};

    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data?.data)) return payload.data.data;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.suppliers)) return payload.suppliers;
    if (Array.isArray(payload.branches)) return payload.branches;
    if (Array.isArray(payload.products)) return payload.products;

    return [];
  };

  const loadOptions = async () => {
    try {
      setLoadingOptions(true);
      setError('');

      const [supplierResponse, branchResponse, productResponse, meResponse] = await Promise.all([
        api.get('/suppliers/all'),
        api.get('/branches/all'),
        api.get('/products/all'),
        api.get('/me').catch(() => null),
      ]);

      setCurrentUser(extractUser(meResponse?.data) || getStoredUser());
      setSuppliers(extractList(supplierResponse.data));
      setBranches(extractList(branchResponse.data));
      setProducts(extractList(productResponse.data));
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Supplier, branch or product load failed.'));
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    loadOptions();
  }, []);

  const handleFormChange = (e) => {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleItemFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === 'checkbox' ? checked : value;

    if (name === 'product_id') {
      const product = products.find(
        (item) => String(getProductId(item)) === String(value)
      );

      setItemForm((previous) => ({
        ...previous,
        product_id: value,
        product_variant_id: '',
        unit_cost: previous.unit_cost || String(getProductCost(product)),
        track_imei: product ? productNeedsImei(product) : previous.track_imei,
      }));

      return;
    }

    if (name === 'product_variant_id') {
      const variant = selectedProductVariants.find((item) => String(item.id) === String(value));
      setItemForm((previous) => ({
        ...previous,
        product_variant_id: value,
        unit_cost: previous.unit_cost || String(getVariantCost(variant) || getProductCost(selectedProduct)),
      }));
      return;
    }

    setItemForm((previous) => ({
      ...previous,
      [name]: nextValue,
    }));
  };

  const handleScanSubmit = (e) => {
    e.preventDefault();

    const code = scanCode.trim();

    if (!code) {
      setError('Please scan or enter barcode / SKU.');
      return;
    }

    const match = findProductByCode(code);

    if (!match?.product) {
      setError(`Product not found for barcode / SKU: ${code}. Please create product/variant from Product module first.`);
      return;
    }

    addProductToInvoice({
      product: match.product,
      variant: match.variant,
      quantity: 1,
      unitCost: getVariantCost(match.variant) || getProductCost(match.product),
      trackImei: productNeedsImei(match.product),
      source: 'scan',
    });

    setScanCode('');
  };

  const findProductByCode = (code) => {
    const normalizedCode = String(code).trim().toLowerCase();

    for (const product of products) {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const productCandidates = [
        getProductId(product),
        product.sku,
        product.product_sku,
        product.barcode,
        product.product_barcode,
        product.code,
        product.product_code,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());

      if (productCandidates.includes(normalizedCode)) {
        return { product, variant: null };
      }

      const matchedVariant = variants.find((variant) => {
        const variantCandidates = [variant.id, variant.sku, variant.barcode, variant.variant_name, variant.color_name, variant.region, variant.storage]
          .filter(Boolean)
          .map((value) => String(value).trim().toLowerCase());
        return variantCandidates.includes(normalizedCode);
      });

      if (matchedVariant) {
        return { product, variant: matchedVariant };
      }
    }

    return null;
  };

  const addProductToInvoice = ({
    product,
    variant = null,
    quantity = 1,
    unitCost = 0,
    trackImei = true,
    note = '',
    source = 'manual',
  }) => {
    const productId = getProductId(product);
    const productVariantId = variant?.id || itemForm.product_variant_id || '';

    if (!productId) {
      setError('Product ID missing.');
      return;
    }

    const quantityNumber = Math.max(Math.floor(Number(quantity || 1)), 1);
    const unitCostNumber = Math.max(Number(unitCost || 0), 0);
    const shouldTrackImei = Boolean(trackImei);

    /*
      Same product + same purchase price: the quantity can be increased.
      Same product + different purchase price: a separate row is added.
    */
    const sameProductSamePriceItem = items.find(
      (item) =>
        String(item.product_id) === String(productId) &&
        String(item.product_variant_id || '') === String(productVariantId || '') &&
        Number(item.unit_cost || 0) === unitCostNumber &&
        Boolean(item.track_imei) === shouldTrackImei
    );

    if (sameProductSamePriceItem) {
      const confirmed = window.confirm(
        t('purchases.same_price_confirm', { name: sameProductSamePriceItem.product_name, quantity: quantityNumber })
      );

      if (confirmed) {
        increaseItemQuantity(sameProductSamePriceItem.local_id, quantityNumber);
        setMessage(`${sameProductSamePriceItem.product_name} quantity updated.`);
        setError('');
        return;
      }
    }

    const devices = shouldTrackImei
      ? Array.from({ length: quantityNumber }, () => createEmptyDevice(unitCostNumber))
      : [];

    const newItem = {
      local_id: makeLocalId(),
      product_id: productId,
      product_variant_id: productVariantId || null,
      variant_name: variant?.display_name || variant?.variant_name || makeVariantLabel(variant),
      product_name: getProductName(product),
      sku: getVariantSku(variant) || getProductSku(product),
      barcode: getVariantBarcode(variant) || getProductBarcode(product),
      quantity: quantityNumber,
      unit_cost: unitCostNumber,
      line_total: calculateLineTotal({
        quantity: quantityNumber,
        unit_cost: unitCostNumber,
        track_imei: shouldTrackImei,
        devices,
      }),
      track_imei: shouldTrackImei,
      note,
      devices,
    };

    setItems((previous) => [...previous, newItem]);
    setMessage(
      source === 'scan'
        ? `Product added by scan: ${getProductName(product)}`
        : `Product added: ${getProductName(product)}`
    );
    setError('');
  };

  const increaseItemQuantity = (localId, addQuantity = 1) => {
    setItems((previous) =>
      previous.map((item) => {
        if (item.local_id !== localId) {
          return item;
        }

        const currentQuantity = Math.max(Math.floor(Number(item.quantity || 1)), 1);
        const addedQuantity = Math.max(Math.floor(Number(addQuantity || 1)), 1);
        const newQuantity = currentQuantity + addedQuantity;
        const unitCost = Math.max(Number(item.unit_cost || 0), 0);

        let devices = Array.isArray(item.devices) ? [...item.devices] : [];

        if (item.track_imei) {
          for (let i = 0; i < addedQuantity; i += 1) {
            devices.push(createEmptyDevice(unitCost));
          }
        } else {
          devices = [];
        }

        const updatedItem = {
          ...item,
          quantity: newQuantity,
          devices,
        };

        updatedItem.line_total = calculateLineTotal(updatedItem);

        return updatedItem;
      })
    );
  };

  const handleAddManualItem = (e) => {
    e.preventDefault();

    if (!itemForm.product_id) {
      setError('Please select product.');
      return;
    }

    const product = selectedProduct;

    if (!product) {
      setError('Selected product not found.');
      return;
    }

    addProductToInvoice({
      product,
      variant: selectedVariant,
      quantity: itemForm.quantity,
      unitCost: itemForm.unit_cost || getVariantCost(selectedVariant) || getProductCost(product),
      trackImei: itemForm.track_imei,
      note: itemForm.note,
      source: 'manual',
    });

    setItemForm(emptyItemForm);
  };

  const handleRemoveItem = (localId) => {
    setItems((previous) => previous.filter((item) => item.local_id !== localId));
  };

  const handleItemValueChange = (localId, field, value) => {
    setItems((previous) =>
      previous.map((item) => {
        if (item.local_id !== localId) {
          return item;
        }

        const updatedItem = {
          ...item,
          [field]: value,
        };

        if (field === 'track_imei') {
          updatedItem.track_imei = Boolean(value);
        }

        const quantity = Math.max(Math.floor(Number(updatedItem.quantity || 1)), 1);
        const unitCost = Math.max(Number(updatedItem.unit_cost || 0), 0);

        updatedItem.quantity = quantity;
        updatedItem.unit_cost = unitCost;

        let devices = Array.isArray(updatedItem.devices) ? [...updatedItem.devices] : [];

        if (updatedItem.track_imei) {
          if (devices.length < quantity) {
            const addCount = quantity - devices.length;

            for (let i = 0; i < addCount; i += 1) {
              devices.push(createEmptyDevice(unitCost));
            }
          }

          if (devices.length > quantity) {
            devices = devices.slice(0, quantity);
          }

          /*
            Changing the row purchase price updates every device price by default.
            Each device price can still be edited separately afterwards.
          */
          if (field === 'unit_cost') {
            devices = devices.map((device) => ({
              ...device,
              purchase_cost: unitCost,
            }));
          }
        } else {
          devices = [];
        }

        updatedItem.devices = devices;
        updatedItem.line_total = calculateLineTotal(updatedItem);

        return updatedItem;
      })
    );
  };

  const handleDeviceChange = (itemLocalId, deviceIndex, field, value) => {
    setItems((previous) =>
      previous.map((item) => {
        if (item.local_id !== itemLocalId) {
          return item;
        }

        const devices = [...item.devices];

        devices[deviceIndex] = {
          ...devices[deviceIndex],
          [field]: value,
        };

        const updatedItem = {
          ...item,
          devices,
        };

        updatedItem.line_total = calculateLineTotal(updatedItem);

        return updatedItem;
      })
    );
  };

  const handleGenerateDeviceBarcode = (itemLocalId, deviceIndex) => {
    const barcode = generateLocalBarcode();
    handleDeviceChange(itemLocalId, deviceIndex, 'barcode', barcode);
  };

  const handleClearDeviceBarcode = (itemLocalId, deviceIndex) => {
    handleDeviceChange(itemLocalId, deviceIndex, 'barcode', '');
  };

  const validateBeforeSubmit = () => {
    if (!form.supplier_id) {
      return 'Please select supplier.';
    }

    if (items.length === 0) {
      return 'Please add at least one product item.';
    }

    for (const item of items) {
      if (!item.product_id) {
        return 'Every item must have product.';
      }

      if (Number(item.quantity || 0) <= 0) {
        return 'Item quantity must be greater than 0.';
      }

      if (Number(item.unit_cost || 0) < 0) {
        return 'Purchase price cannot be negative.';
      }

      const quantityCount = Math.floor(Number(item.quantity || 0));

      if (item.track_imei && item.devices.length !== quantityCount) {
        return `Device row count must match quantity for ${item.product_name}.`;
      }

      if (item.track_imei) {
        const hasNegativeDevicePrice = item.devices.some(
          (device) => Number(device.purchase_cost || 0) < 0
        );

        if (hasNegativeDevicePrice) {
          return `Device Purchase Price cannot be negative for ${item.product_name}.`;
        }
      }
    }

    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateBeforeSubmit();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setMessage('');
      setError('');

      const payload = {
        supplier_id: Number(form.supplier_id),
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        purchase_no: form.purchase_no || null,
        purchase_date: form.purchase_date || null,
        supplier_invoice_number: form.supplier_invoice_number || null,
        supplier_invoice_date: form.supplier_invoice_date || null,
        final_amount: subtotal,
        paid_amount: Number(form.paid_amount || 0),
        payment_method: form.payment_method,
        transaction_id: form.transaction_id || null,
        status: form.status,
        note: form.note || null,
        items: items.map((item) => ({
          product_id: item.product_id ? Number(item.product_id) : null,
          product_variant_id: item.product_variant_id ? Number(item.product_variant_id) : null,
          product_name: item.product_name,
          sku: item.sku,
          barcode: item.barcode,
          quantity: Number(item.quantity || 1),
          unit_cost: item.track_imei
            ? getAverageDevicePurchaseCost(item)
            : Number(item.unit_cost || 0),
          line_total: Number(item.line_total || 0),
          note: item.note || null,
          devices: item.track_imei
            ? item.devices.map((device) => ({
                model_number: device.model_number || null,
                imei_1: device.imei_1 || null,
                imei_2: device.imei_2 || null,
                barcode: device.barcode || null,
                imei_1_barcode: device.imei_1_barcode || null,
                imei_2_barcode: device.imei_2_barcode || null,
                purchase_cost: Number(device.purchase_cost || 0),
                battery_health: device.battery_health || null,
                condition: device.condition || null,
                note: device.note || null,
              }))
            : [],
        })),
      };

      const submitData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (key === 'items') {
          submitData.append('items', JSON.stringify(value));
        } else if (value !== null && value !== undefined) {
          submitData.append(key, value);
        }
      });
      if (supplierInvoiceFile) {
        submitData.append('supplier_invoice_file', supplierInvoiceFile);
      }

      const response = await purchaseService.createPurchase(submitData);

      setMessage(response?.message || 'Purchase created successfully.');

      const waiting = Number(response?.devices_awaiting_inspection || 0);
      setTimeout(() => {
        navigate(waiting > 0 ? '/device-stock?status=awaiting_inspection' : '/purchases');
      }, waiting > 0 ? 2200 : 900);
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Purchase create failed.'));
    } finally {
      setSaving(false);
    }
  };

  const formatPrice = (amount) => {
    return `BDT ${Number(amount || 0).toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-[var(--nst-dashboard-surface)] p-4 md:p-6">
      <NstPageHeader icon={NstHdrShoppingBag} title={t('purchases.create_title')} subtitle={t('purchases.create_subtitle')} actions={<><Link
          to="/purchases"
          className="inline-flex items-center justify-center rounded-lg bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
        >
          Back to Purchases
        </Link></>}/>

      {message && (
        <div className="mb-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loadingOptions && (
        <div className="mb-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Supplier, branch and product loading...
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)] mb-4">
              Purchase Basic Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass()}>Supplier *</label>
                <select
                  name="supplier_id"
                  value={form.supplier_id}
                  onChange={handleFormChange}
                  className={inputClass()}
                  required
                >
                  <option value="">Select Supplier</option>

                  {suppliers.map((supplier) => (
                    <option key={getSupplierId(supplier)} value={getSupplierId(supplier)}>
                      {getSupplierName(supplier)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass()}>Branch</label>
                <select
                  name="branch_id"
                  value={form.branch_id}
                  onChange={handleFormChange}
                  className={inputClass()}
                >
                  <option value="">Select Branch</option>

                  {branches.map((branch) => (
                    <option key={getBranchId(branch)} value={getBranchId(branch)}>
                      {getBranchName(branch)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass()}>Purchase No</label>
                <input
                  type="text"
                  name="purchase_no"
                  value={form.purchase_no}
                  onChange={handleFormChange}
                  placeholder="Auto if empty"
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass()}>Purchase Date</label>
                <input
                  type="date"
                  name="purchase_date"
                  value={form.purchase_date}
                  onChange={handleFormChange}
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass()}>Supplier Invoice Number</label>
                <input
                  type="text"
                  name="supplier_invoice_number"
                  value={form.supplier_invoice_number}
                  onChange={handleFormChange}
                  placeholder="Supplier bill/reference no"
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass()}>Supplier Invoice Date</label>
                <input
                  type="date"
                  name="supplier_invoice_date"
                  value={form.supplier_invoice_date}
                  onChange={handleFormChange}
                  className={inputClass()}
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass()}>Supplier Invoice Upload</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(event) => setSupplierInvoiceFile(event.target.files?.[0] || null)}
                  className={inputClass()}
                />
                {supplierInvoiceFile && <p className="mt-1 text-xs text-gray-500">Selected: {supplierInvoiceFile.name}</p>}
              </div>

              {canViewPurchasePrice && (
                <div>
                  <label className={labelClass()}>Paid Now</label>
                  <input
                    type="number"
                    name="paid_amount"
                    value={form.paid_amount}
                    onChange={handleFormChange}
                    min="0"
                    step="0.01"
                    className={inputClass()}
                  />
                </div>
              )}

              {canViewPurchasePrice && (
                <div>
                  <label className={labelClass()}>Payment Method</label>
                  <select
                    name="payment_method"
                    value={form.payment_method}
                    onChange={handleFormChange}
                    className={inputClass()}
                  >
                    {paymentMethods.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {canViewPurchasePrice && (
                <div>
                  <label className={labelClass()}>Transaction ID</label>
                  <input
                    type="text"
                    name="transaction_id"
                    value={form.transaction_id}
                    onChange={handleFormChange}
                    placeholder="Optional"
                    className={inputClass()}
                  />
                </div>
              )}

              <div>
                <label className={labelClass()}>Status</label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleFormChange}
                  className={inputClass()}
                >
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={labelClass()}>Note</label>
                <textarea
                  name="note"
                  value={form.note}
                  onChange={handleFormChange}
                  rows="2"
                  placeholder="Purchase note..."
                  className={inputClass()}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)] mb-4">
              Barcode / SKU Scan
            </h2>

            <form onSubmit={handleScanSubmit} className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                placeholder="Scan product barcode / SKU, then enter/scan IMEI below"
                className={inputClass()}
                autoComplete="off"
                autoFocus
              />

              <button
                type="submit"
                className="rounded-lg bg-[var(--nst-dashboard-secondary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-secondary)]"
              >
                Add by Barcode/SKU
              </button>
            </form>

            <p className="text-xs text-gray-500 mt-2">
              {t('purchases.price_row_help')}
            </p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-800">
            <p className="font-bold">{t('purchases.manual_add_disabled_title')}</p>
            <p className="mt-1">
              {t('purchases.manual_add_disabled_body')}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)] mb-4">
              Purchase Items & Device Units
            </h2>

            {items.length === 0 ? (
              <div className="rounded-lg bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                No item added yet. Scan barcode/SKU or use manual add.
              </div>
            ) : (
              <div className="space-y-5">
                {items.map((item, itemIndex) => (
                  <div key={item.local_id} className="rounded-xl border border-gray-100 p-4">
                    <div className="mb-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-[var(--nst-dashboard-text)]">
                          {itemIndex + 1}. {item.product_name}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          SKU: {item.sku || '-'} | Product Barcode: {item.barcode || '-'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.local_id)}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <label className={labelClass()}>Quantity</label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            handleItemValueChange(item.local_id, 'quantity', e.target.value)
                          }
                          min="1"
                          step="1"
                          className={inputClass()}
                        />
                      </div>

                      {canViewPurchasePrice && (
                        <div>
                          <label className={labelClass()}>
                            {item.track_imei ? 'Default Purchase Price' : 'Purchase Price'}
                          </label>
                          <input
                            type="number"
                            value={item.unit_cost}
                            onChange={(e) =>
                              handleItemValueChange(item.local_id, 'unit_cost', e.target.value)
                            }
                            min="0"
                            step="0.01"
                            className={inputClass()}
                          />
                        </div>
                      )}

                      {canViewPurchasePrice && (
                        <div>
                          <label className={labelClass()}>Line Total</label>
                          <input
                            type="text"
                            value={formatPrice(item.line_total)}
                            readOnly
                            className={`${inputClass()} bg-gray-50`}
                          />
                        </div>
                      )}

                      <div>
                        <label className={labelClass()}>IMEI Tracking</label>
                        <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 bg-white">
                          <input
                            type="checkbox"
                            checked={item.track_imei}
                            onChange={(e) =>
                              handleItemValueChange(item.local_id, 'track_imei', e.target.checked)
                            }
                          />
                          Track IMEI
                        </label>
                      </div>
                    </div>

                    {item.track_imei ? (
                      <div className="space-y-4">
                        <h4 className="font-semibold text-sm text-gray-700">
                          Device IMEI / Barcode / Purchase Price
                        </h4>

                        {item.devices.map((device, deviceIndex) => (
                          <div
                            key={`${item.local_id}-device-${deviceIndex}`}
                            className="rounded-lg bg-gray-50 border border-gray-100 p-4"
                          >
                            <div className="mb-3 font-semibold text-sm text-[var(--nst-dashboard-text)]">
                              Device {deviceIndex + 1}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                              <div>
                                <label className={labelClass()}>Model Number (Optional)</label>
                                <input
                                  type="text"
                                  value={device.model_number || ''}
                                  onChange={(e) =>
                                    handleDeviceChange(item.local_id, deviceIndex, 'model_number', e.target.value)
                                  }
                                  placeholder="SM-S928B, A3108, etc."
                                  className={inputClass()}
                                />
                              </div>

                              <div>
                                <label className={labelClass()}>IMEI 1</label>
                                <input
                                  type="text"
                                  value={device.imei_1}
                                  onChange={(e) =>
                                    handleDeviceChange(item.local_id, deviceIndex, 'imei_1', e.target.value)
                                  }
                                  placeholder="IMEI 1"
                                  className={inputClass()}
                                />
                              </div>

                              <div>
                                <label className={labelClass()}>IMEI 2</label>
                                <input
                                  type="text"
                                  value={device.imei_2}
                                  onChange={(e) =>
                                    handleDeviceChange(item.local_id, deviceIndex, 'imei_2', e.target.value)
                                  }
                                  placeholder="IMEI 2"
                                  className={inputClass()}
                                />
                              </div>

                              <div>
                                <label className={labelClass()}>Main Barcode</label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={device.barcode}
                                    onChange={(e) =>
                                      handleDeviceChange(item.local_id, deviceIndex, 'barcode', e.target.value)
                                    }
                                    placeholder="Empty = backend auto"
                                    className={inputClass()}
                                  />

                                  <button
                                    type="button"
                                    onClick={() => handleGenerateDeviceBarcode(item.local_id, deviceIndex)}
                                    className="rounded-lg bg-[var(--nst-dashboard-primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)] whitespace-nowrap"
                                  >
                                    Auto
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleClearDeviceBarcode(item.local_id, deviceIndex)}
                                  className="mt-1 text-xs font-semibold text-gray-500 hover:text-red-600"
                                >
                                  Clear barcode and let backend auto-generate
                                </button>
                              </div>

                              <div>
                                <label className={labelClass()}>IMEI 1 Barcode</label>
                                <input
                                  type="text"
                                  value={device.imei_1_barcode}
                                  onChange={(e) =>
                                    handleDeviceChange(item.local_id, deviceIndex, 'imei_1_barcode', e.target.value)
                                  }
                                  placeholder="Empty = IMEI 1"
                                  className={inputClass()}
                                />
                              </div>

                              <div>
                                <label className={labelClass()}>IMEI 2 Barcode</label>
                                <input
                                  type="text"
                                  value={device.imei_2_barcode}
                                  onChange={(e) =>
                                    handleDeviceChange(item.local_id, deviceIndex, 'imei_2_barcode', e.target.value)
                                  }
                                  placeholder="Empty = IMEI 2"
                                  className={inputClass()}
                                />
                              </div>

                              {canViewPurchasePrice && (
                                <div>
                                  <label className={labelClass()}>Device Purchase Price</label>
                                  <input
                                    type="number"
                                    value={device.purchase_cost}
                                    onChange={(e) =>
                                      handleDeviceChange(item.local_id, deviceIndex, 'purchase_cost', e.target.value)
                                    }
                                    min="0"
                                    step="0.01"
                                    className={inputClass()}
                                  />
                                </div>
                              )}

                              <div className="md:col-span-2 xl:col-span-3">
                                <label className={labelClass()}>Device Note</label>
                                <input
                                  type="text"
                                  value={device.note}
                                  onChange={(e) =>
                                    handleDeviceChange(item.local_id, deviceIndex, 'note', e.target.value)
                                  }
                                  placeholder="Optional device note"
                                  className={inputClass()}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                        This product is non-IMEI item. Only quantity stock will be used.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-[var(--nst-dashboard-primary)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-primary)] disabled:opacity-60"
          >
            {saving ? 'Saving Purchase...' : 'Save Purchase'}
          </button>
        </div>

        {canViewPurchasePrice && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-fit">
            <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)] mb-4">
              Purchase Summary
            </h2>

            <div className="space-y-3 text-sm">
              <SummaryRow label="Total Product Rows" value={items.length} />
              <SummaryRow label="Subtotal" value={formatPrice(subtotal)} />
              <SummaryRow label="Paid Now" value={formatPrice(paidAmount)} success />
              <SummaryRow label="Due Before Advance" value={formatPrice(dueBeforeAdvance)} danger />
              <SummaryRow label="Supplier Advance" value={formatPrice(supplierAdvance)} success />
              <SummaryRow label="Advance Auto Adjust" value={formatPrice(possibleAdvanceAdjust)} success />
              <SummaryRow label="Final Due After Advance" value={formatPrice(finalDueAfterAdvance)} danger />
            </div>

            <div className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {t('purchases.device_price_help')}
            </div>
          </div>
        )}

        {!canViewPurchasePrice && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-fit">
            <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)] mb-4">
              Purchase Summary
            </h2>

            <div className="space-y-3 text-sm">
              <SummaryRow label="Total Product Rows" value={items.length} />
            </div>

            <div className="mt-5 rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
              {t('purchases.price_visibility_note')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function createEmptyDevice(unitCost = 0) {
  return {
    model_number: '',
    imei_1: '',
    imei_2: '',
    barcode: '',
    imei_1_barcode: '',
    imei_2_barcode: '',
    purchase_cost: Number(unitCost || 0),
    note: '',
  };
}

function calculateLineTotal(item) {
  if (item?.track_imei) {
    const devices = Array.isArray(item.devices) ? item.devices : [];

    if (devices.length === 0) {
      return Math.max(Number(item.quantity || 1), 1) * Math.max(Number(item.unit_cost || 0), 0);
    }

    return devices.reduce((total, device) => {
      return total + Math.max(Number(device.purchase_cost || 0), 0);
    }, 0);
  }

  return Math.max(Number(item.quantity || 1), 1) * Math.max(Number(item.unit_cost || 0), 0);
}

function getAverageDevicePurchaseCost(item) {
  const devices = Array.isArray(item.devices) ? item.devices : [];

  if (!item.track_imei || devices.length === 0) {
    return Number(item.unit_cost || 0);
  }

  const total = devices.reduce((sum, device) => {
    return sum + Number(device.purchase_cost || 0);
  }, 0);

  return total / devices.length;
}

function makeLocalId() {
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function generateLocalBarcode() {
  const random = Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, '0');

  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '');

  return `NST-${date}-${random}`;
}

function productNeedsImei(product) {
  const explicit =
    product?.track_imei ??
    product?.requires_imei ??
    product?.has_imei ??
    product?.is_serialized;

  if (explicit !== undefined && explicit !== null) {
    return explicit === true ||
      explicit === 1 ||
      explicit === '1' ||
      explicit === 'true' ||
      explicit === 'yes';
  }

  const text = [
    product?.name,
    product?.product_name,
    product?.title,
    product?.category_name,
    product?.category?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const nonImeiWords = [
    'charger',
    'cover',
    'case',
    'cable',
    'adapter',
    'earphone',
    'headphone',
    'protector',
    'accessory',
    'accessories',
  ];

  if (nonImeiWords.some((word) => text.includes(word))) {
    return false;
  }

  return true;
}

function extractUser(payload) {
  if (!payload) return null;

  if (payload.user) {
    return {
      ...payload.user,
      roles: payload.user.roles || payload.roles || payload.role || [],
      permissions: payload.user.permissions || payload.permissions || [],
    };
  }

  if (payload.data?.user) {
    return {
      ...payload.data.user,
      roles: payload.data.user.roles || payload.data.roles || payload.roles || payload.data.role || [],
      permissions: payload.data.user.permissions || payload.data.permissions || payload.permissions || [],
    };
  }

  if (payload.data) return payload.data;

  return payload;
}

function getStoredUser() {
  const keys = [
    'user',
    'auth_user',
    'currentUser',
    'current_user',
    'admin_user',
    'nst_user',
  ];

  for (const key of keys) {
    try {
      const value = localStorage.getItem(key);

      if (!value) continue;

      const parsed = JSON.parse(value);

      if (parsed) return extractUser(parsed);
    } catch (error) {
      console.log(error);
    }
  }

  return null;
}


function makeVariantLabel(variant) {
  if (!variant) return '';
  return [variant.color_name, variant.region, variant.variant_type, variant.ram, variant.storage]
    .filter(Boolean)
    .join(' / ') || variant.display_name || variant.variant_name || 'Default Variant';
}

function getVariantSku(variant) {
  return variant?.sku || '';
}

function getVariantBarcode(variant) {
  return variant?.barcode || '';
}

function getVariantCost(variant) {
  return Number(variant?.purchase_price ?? variant?.unit_cost ?? 0);
}

function canSeePurchasePrice(user) {
  const roles = getUserRoles(user);

  if (
    roles.some((role) =>
      [
        'super admin',
        'super_admin',
        'super-admin',
        'superadmin',
        'admin',
        'accountant',
      ].includes(role)
    )
  ) {
    return true;
  }

  const permissions = getUserPermissions(user);

  return permissions.some((permission) =>
    [
      'purchase price view',
      'purchase_price_view',
      'view purchase price',
      'view_purchase_price',
      'purchases.view-price',
      'purchase.view-price',
      'purchases.manage',
      'purchase.manage',
    ].includes(permission)
  );
}

function getUserRoles(user) {
  if (!user) return [];

  const roles = [];

  if (user.role) roles.push(user.role);
  if (user.role_name) roles.push(user.role_name);
  if (user.type) roles.push(user.type);

  if (Array.isArray(user.roles)) {
    user.roles.forEach((role) => {
      if (typeof role === 'string') roles.push(role);
      if (role?.name) roles.push(role.name);
      if (role?.title) roles.push(role.title);
    });
  }

  return roles
    .filter(Boolean)
    .map((role) => String(role).trim().toLowerCase());
}

function getUserPermissions(user) {
  if (!user) return [];

  const permissions = [];

  if (Array.isArray(user.permissions)) {
    user.permissions.forEach((permission) => {
      if (typeof permission === 'string') permissions.push(permission);
      if (permission?.name) permissions.push(permission.name);
    });
  }

  if (Array.isArray(user.all_permissions)) {
    user.all_permissions.forEach((permission) => {
      if (typeof permission === 'string') permissions.push(permission);
      if (permission?.name) permissions.push(permission.name);
    });
  }

  return permissions
    .filter(Boolean)
    .map((permission) => String(permission).trim().toLowerCase());
}

function getSupplierId(supplier) {
  return supplier?.id ?? supplier?.supplier_id ?? null;
}

function getSupplierName(supplier) {
  return supplier?.name || supplier?.supplier_name || supplier?.company_name || `Supplier #${getSupplierId(supplier)}`;
}

function getBranchId(branch) {
  return branch?.id ?? branch?.branch_id ?? null;
}

function getBranchName(branch) {
  return branch?.name || branch?.branch_name || `Branch #${getBranchId(branch)}`;
}

function getProductId(product) {
  return product?.id ?? product?.product_id ?? null;
}

function getProductName(product) {
  return product?.name || product?.product_name || product?.title || `Product #${getProductId(product)}`;
}

function getProductSku(product) {
  return product?.sku || product?.product_sku || product?.code || '';
}

function getProductBarcode(product) {
  return product?.barcode || product?.product_barcode || product?.product_code || '';
}

function getProductCost(product) {
  return Number(
    product?.purchase_price ??
      product?.cost_price ??
      product?.buying_price ??
      product?.price ??
      0
  );
}

function SummaryRow({ label, value, success = false, danger = false }) {
  let valueClass = 'text-[var(--nst-dashboard-text)]';

  if (success) valueClass = 'text-green-700';
  if (danger) valueClass = 'text-red-600';

  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2">
      <span className="text-gray-500">{label}</span>
      <span className={`font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

function labelClass() {
  return 'block text-sm font-semibold text-gray-700 mb-2';
}

function inputClass() {
  return 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)] bg-white';
}
