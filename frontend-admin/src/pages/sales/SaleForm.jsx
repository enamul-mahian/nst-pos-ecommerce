import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import saleService from '../../services/saleService';
import corporateOpsService from '../../services/corporateOpsService';
import BdMoneyInput, { formatBdInteger } from '../../components/BdMoneyInput';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { ShoppingCart as NstHdrShoppingCart } from 'lucide-react';
import { useT } from '../../i18n';

const mfsOptions = [
  { key: 'bkash', label: 'bKash' },
  { key: 'nagad', label: 'Nagad' },
  { key: 'rocket', label: 'Rocket' },
  { key: 'upay', label: 'Upay' },
  { key: 'other_mfs', label: 'Other MFS' },
];

const getMfsLabel = (key) => {
  return mfsOptions.find((option) => option.key === key)?.label || 'MFS';
};

const createEmptyMfsPayment = () => ({
  id: `${Date.now()}-${Math.random()}`,
  mfs_method: 'bkash',
  other_mfs_name: '',
  amount: '',
});

const SaleForm = () => {
  const t = useT();
  const navigate = useNavigate();
  const barcodeInputRef = useRef(null);

  const [branches, setBranches] = useState([]);
  const [paymentReceivers, setPaymentReceivers] = useState([]);
  const [emiBanks, setEmiBanks] = useState([]);
  const [branchProducts, setBranchProducts] = useState([]);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [cartItems, setCartItems] = useState([]);

  const [formData, setFormData] = useState({
    branch_id: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    invoice_discount_percent: '0',
    invoice_discount_amount: '0',
    delivery_charge: '0',
    payment_received_by: '',
    home_delivery: false,
    send_sms: false,
    send_email: false,
    attach_invoice_pdf: true,
    note: '',
  });

  const [barcodeSearch, setBarcodeSearch] = useState('');

  const [payments, setPayments] = useState({
    cash: '',
    mfs_payments: [createEmptyMfsPayment()],
    bank: '',
    card: '',
    emi: '',
    emi_bank: '',
    emi_custom_bank: '',
    emi_months: '12',
    emi_custom_months: '',
    emi_reference: '',
  });

  const [previousDue, setPreviousDue] = useState(0);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const getErrorMessage = (err) => {
    if (err?.response?.data?.errors) {
      return Object.values(err.response.data.errors).flat().join(' ');
    }

    return err?.response?.data?.message || err?.message || 'Something went wrong.';
  };

  const normalizeArray = (response) => {
    const payload = response?.data ?? response;

    const possibleArrays = [
      payload,
      payload?.data?.items,
      payload?.data?.stocks,
      payload?.data?.products,
      payload?.data?.data,
      payload?.items,
      payload?.stocks,
      payload?.products,
      payload?.data,
    ];

    return possibleArrays.find((item) => Array.isArray(item)) || [];
  };

  const cleanText = (value) => {
    if (value === null || value === undefined) {
      return '';
    }

    const text = String(value).trim();
    return text === '-' ? '' : text;
  };

  const normalizeSearchText = (...values) => {
    return values
      .flat(Infinity)
      .map(cleanText)
      .filter(Boolean)
      .join(' ')
      .replace(/[_\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  };

  const isExactValueMatch = (keyword, values = []) => {
    const exactKeyword = cleanText(keyword).toLowerCase();

    if (!exactKeyword) {
      return false;
    }

    return values
      .map((value) => cleanText(value).toLowerCase())
      .filter(Boolean)
      .some((value) => value === exactKeyword);
  };

  const normalizeStockItem = (item) => {
    const product = item?.product || item;
    const quantity = Number(
      item?.quantity ??
        item?.branch_quantity ??
        item?.stock_quantity ??
        item?.available_quantity ??
        product?.pivot?.quantity ??
        product?.stock_quantity ??
        0
    );

    return {
      stock_id: item?.id || item?.branch_stock_id || item?.stock_id,
      product_id: item?.product_id || product?.id,
      product_variant_id: item?.product_variant_id || item?.variant_id || item?.variant?.id || '',
      variant_name: item?.variant_name || item?.variant?.display_name || item?.variant?.variant_name || '',
      color_name: item?.color_name || item?.variant?.color_name || '',
      region: item?.region || item?.variant?.region || '',
      variant_type: item?.variant_type || item?.variant?.variant_type || '',
      ram: item?.ram || item?.variant?.ram || '',
      storage: item?.storage || item?.variant?.storage || '',
      name: item?.display_name || item?.product_name || product?.name || '-',
      sku: item?.product_sku || product?.sku || '-',
      barcode: item?.product_barcode || product?.barcode || '-',
      model: item?.product_model || product?.model || '',
      brand: item?.product_brand || product?.brand?.name || product?.brand || '-',
      category: item?.product_category || product?.category?.name || product?.category || '-',
      condition: item?.product_condition || product?.condition || '',
      quantity,
      product_total_stock: Number(item?.product_total_stock || product?.stock_quantity || quantity || 0),
      sale_price: Number(item?.sale_price ?? product?.sale_price ?? product?.regular_price ?? product?.discount_price ?? 0),
      purchase_price: Number(item?.purchase_price ?? product?.purchase_price ?? 0),
    };
  };

  const normalizeDevice = (device) => ({
    id: device?.id,
    product_id: device?.product_id,
    product_variant_id: device?.product_variant_id || device?.variant_id || '',
    branch_id: device?.branch_id,
    product_name: device?.display_name || device?.product_name || device?.product?.name || '-',
    variant_name: device?.variant_name || '',
    sku: device?.sku || device?.variant_sku || device?.product?.sku || '-',
    barcode: device?.barcode || '',
    imei_1: device?.imei_1 || '',
    imei_2: device?.imei_2 || '',
    color_name: device?.color_name || '',
    region: device?.region || '',
    variant_type: device?.variant_type || '',
    ram: device?.ram || '',
    storage: device?.storage || '',
    sale_price: Number(device?.sale_price ?? device?.selling_price ?? device?.product?.sale_price ?? 0),
    status: device?.status || 'available',
  });

  const selectedDeviceIds = useMemo(() => {
    return new Set(
      cartItems.flatMap((item) => (item.selected_devices || []).map((device) => String(device.id)))
    );
  }, [cartItems]);

  const availableDevicesForCart = useMemo(() => {
    return availableDevices.filter((device) => !selectedDeviceIds.has(String(device.id)));
  }, [availableDevices, selectedDeviceIds]);

  const devicesByProduct = useMemo(() => {
    return availableDevicesForCart.reduce((grouped, device) => {
      const key = `${device.product_id || ''}-${device.product_variant_id || 'default'}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(device);
      return grouped;
    }, {});
  }, [availableDevicesForCart]);

  const allDevicesByProduct = useMemo(() => {
    return availableDevices.reduce((grouped, device) => {
      const key = `${device.product_id || ''}-${device.product_variant_id || 'default'}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(device);
      return grouped;
    }, {});
  }, [availableDevices]);

  const fetchOptions = async () => {
    try {
      const response = await saleService.getPosOptions();
      const data = response?.data?.data || response?.data || {};

      setBranches(Array.isArray(data.branches) ? data.branches : []);
      setPaymentReceivers(Array.isArray(data.payment_receivers) ? data.payment_receivers : []);
    } catch (err) {
      console.error('POS options error:', err);
      setError(getErrorMessage(err));
    }
  };

  const fetchEmiBanks = async () => {
    try {
      const response = await corporateOpsService.listEmiBanks();
      const payload = response?.data?.data || response?.data || [];
      const activeBanks = Array.isArray(payload) ? payload.filter((bank) => bank?.is_active !== false && bank?.is_active !== 0) : [];
      setEmiBanks(activeBanks);
      if (activeBanks.length > 0) {
        setPayments((previous) => previous.emi_bank ? previous : { ...previous, emi_bank: String(activeBanks[0].bank_name || '') });
      }
    } catch (err) {
      console.warn('EMI bank list load failed:', err);
      setEmiBanks([]);
    }
  };

  const fetchAvailableDevices = async (branchId) => {
    if (!branchId) {
      setAvailableDevices([]);
      return;
    }

    try {
      setDevicesLoading(true);
      const response = await saleService.getAvailableDevices({ branch_id: branchId, limit: 1000 });
      const devices = normalizeArray(response).map(normalizeDevice).filter((device) => device.id);
      setAvailableDevices(devices);
    } catch (err) {
      console.warn('Available devices load failed:', err);
      setAvailableDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  };

  const fetchBranchStock = async (branchId) => {
    if (!branchId) {
      setBranchProducts([]);
      setAvailableDevices([]);
      return;
    }

    try {
      setProductsLoading(true);
      setError('');

      fetchAvailableDevices(branchId);

      let stockResponse = null;
      let items = [];

      try {
        stockResponse = await saleService.searchProducts({ branch_id: branchId, limit: 500 });
        items = normalizeArray(stockResponse).map(normalizeStockItem);
      } catch (searchErr) {
        console.warn('POS product search endpoint failed, branch stock fallback will be used:', searchErr);
      }

      if (items.length === 0) {
        stockResponse = await saleService.getBranchStock(branchId);
        items = normalizeArray(stockResponse).map(normalizeStockItem);
      }

      const saleableItems = items.filter((item) => item.product_id && Number(item.quantity || 0) > 0);

      setBranchProducts(saleableItems);
      setCartItems([]);
      setBarcodeSearch('');

      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    } catch (err) {
      console.error('Branch stock load error:', err);
      setBranchProducts([]);
      setAvailableDevices([]);
      setError(getErrorMessage(err));
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    fetchOptions();
    fetchEmiBanks();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value,
    }));

    if (name === 'branch_id') {
      fetchBranchStock(value);
    }
  };

  const handleCustomerPhoneBlur = async () => {
    const phone = formData.customer_phone.trim();

    if (!phone) {
      setPreviousDue(0);
      return;
    }

    try {
      setCustomerLoading(true);

      const response = await saleService.getCustomerByPhone(phone);
      const customer = response?.data?.data;

      if (customer) {
        setPreviousDue(Number(customer.current_balance || 0));

        setFormData((previous) => ({
          ...previous,
          customer_name: previous.customer_name || customer.name || '',
        }));
      } else {
        setPreviousDue(0);
      }
    } catch (err) {
      console.warn('Customer due load failed:', err);
      setPreviousDue(0);
    } finally {
      setCustomerLoading(false);
    }
  };

  const enrichedBranchProducts = useMemo(() => {
    return branchProducts.map((product) => ({
      ...product,
      device_count: allDevicesByProduct[`${product.product_id}-${product.product_variant_id || 'default'}`]?.length || 0,
      available_device_count: devicesByProduct[`${product.product_id}-${product.product_variant_id || 'default'}`]?.length || 0,
      is_device_tracked: (allDevicesByProduct[`${product.product_id}-${product.product_variant_id || 'default'}`]?.length || 0) > 0,
    }));
  }, [branchProducts, allDevicesByProduct, devicesByProduct]);

  const deviceSearchResults = useMemo(() => {
    const keyword = barcodeSearch.trim().toLowerCase();

    if (!formData.branch_id || !keyword) {
      return [];
    }

    return availableDevicesForCart
      .filter((device) => {
        const searchableText = normalizeSearchText(
          device.product_name,
          device.sku,
          device.barcode,
          device.imei_1,
          device.imei_2,
          device.product_id,
          device.product_variant_id,
          device.variant_name,
          device.color_name,
          device.region,
          device.variant_type,
          device.ram,
          device.storage
        );

        return searchableText.includes(keyword) || normalizeSearchText(searchableText).includes(normalizeSearchText(keyword));
      })
      .slice(0, 20);
  }, [barcodeSearch, availableDevicesForCart, formData.branch_id]);

  const productSearchResults = useMemo(() => {
    const keyword = barcodeSearch.trim().toLowerCase();

    if (!formData.branch_id) {
      return [];
    }

    if (!keyword) {
      return enrichedBranchProducts.slice(0, 10);
    }

    return enrichedBranchProducts
      .filter((item) => {
        const searchableText = normalizeSearchText(
          item.name,
          item.sku,
          item.barcode,
          item.model,
          item.brand,
          item.category,
          item.condition,
          item.product_id,
          item.product_variant_id,
          item.variant_name,
          item.color_name,
          item.region,
          item.variant_type,
          item.ram,
          item.storage
        );

        return searchableText.includes(keyword) || searchableText.includes(normalizeSearchText(keyword));
      })
      .sort((a, b) => {
        const aExact = isExactValueMatch(keyword, [a.barcode, a.sku, a.product_id, a.product_variant_id, a.name]) ? 1 : 0;
        const bExact = isExactValueMatch(keyword, [b.barcode, b.sku, b.product_id, b.product_variant_id, b.name]) ? 1 : 0;
        return bExact - aExact;
      })
      .slice(0, 30);
  }, [barcodeSearch, enrichedBranchProducts, formData.branch_id]);

  const getExactSearchDevice = () => {
    const keyword = barcodeSearch.trim().toLowerCase();

    if (!keyword) {
      return null;
    }

    return availableDevicesForCart.find((device) => {
      return isExactValueMatch(keyword, [device.barcode, device.imei_1, device.imei_2, device.id]);
    });
  };

  const getExactSearchProduct = () => {
    const keyword = barcodeSearch.trim().toLowerCase();

    if (!keyword) {
      return null;
    }

    return enrichedBranchProducts.find((item) => {
      return isExactValueMatch(keyword, [item.barcode, item.sku, item.product_id, item.product_variant_id]);
    });
  };

  const getStockProductByDevice = (device) => {
    return enrichedBranchProducts.find(
      (item) => String(item.product_id) === String(device.product_id) && String(item.product_variant_id || '') === String(device.product_variant_id || '')
    );
  };

  const addDeviceToCart = (device) => {
    if (!device || selectedDeviceIds.has(String(device.id))) {
      setError(t('sales.errors.device_in_cart_or_unavailable'));
      return;
    }

    const stockProduct = getStockProductByDevice(device);

    if (!stockProduct) {
      setError(t('sales.errors.device_stock_not_found'));
      return;
    }

    const existing = cartItems.find(
      (item) => String(item.product_id) === String(stockProduct.product_id) && String(item.product_variant_id || '') === String(stockProduct.product_variant_id || '')
    );

    if (existing) {
      if (Number(existing.quantity || 0) >= Number(stockProduct.quantity || 0)) {
        setError(`Stock limit reached. Available stock: ${stockProduct.quantity}`);
        return;
      }

      setCartItems((previous) =>
        previous.map((item) => {
          if (String(item.product_id) !== String(stockProduct.product_id) || String(item.product_variant_id || '') !== String(stockProduct.product_variant_id || '')) {
            return item;
          }

          const nextDevices = [...(item.selected_devices || []), device];

          return {
            ...item,
            is_device_tracked: true,
            selected_devices: nextDevices,
            quantity: nextDevices.length,
          };
        })
      );
    } else {
      setCartItems((previous) => [
        ...previous,
        {
          product_id: stockProduct.product_id,
          product_variant_id: stockProduct.product_variant_id || '',
          cart_key: `${stockProduct.product_id}-${stockProduct.product_variant_id || 'default'}`,
          variant_name: stockProduct.variant_name || '',
          stock_id: stockProduct.stock_id,
          name: stockProduct.name || device.product_name,
          sku: stockProduct.sku || device.sku,
          barcode: stockProduct.barcode,
          available_quantity: stockProduct.quantity,
          product_total_stock: stockProduct.product_total_stock,
          available_device_count: stockProduct.available_device_count,
          is_device_tracked: true,
          selected_devices: [device],
          quantity: 1,
          rate: device.sale_price || stockProduct.sale_price,
          discount_percent: 0,
          discount_amount: 0,
        },
      ]);
    }

    setBarcodeSearch('');
    setError('');
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  const addStockProductToCart = (stockProduct) => {
    if (!stockProduct) {
      setError(t('sales.errors.product_not_found'));
      return;
    }

    if (Number(stockProduct.quantity || 0) <= 0) {
      setError(t('sales.errors.no_branch_stock'));
      return;
    }

    const isDeviceTracked = Number(stockProduct.device_count || 0) > 0;

    if (isDeviceTracked) {
      const nextDevice = devicesByProduct[`${stockProduct.product_id}-${stockProduct.product_variant_id || 'default'}`]?.[0];

      if (!nextDevice) {
        setError(t('sales.errors.no_available_imei'));
        return;
      }

      addDeviceToCart(nextDevice);
      return;
    }

    const existing = cartItems.find(
      (item) => String(item.product_id) === String(stockProduct.product_id) && String(item.product_variant_id || '') === String(stockProduct.product_variant_id || '')
    );

    if (existing && Number(existing.quantity || 0) >= Number(stockProduct.quantity || 0)) {
      setError(`Stock limit reached. Available stock: ${stockProduct.quantity}`);
      setBarcodeSearch('');
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
      return;
    }

    if (existing) {
      setCartItems((previous) =>
        previous.map((item) => {
          if (String(item.product_id) !== String(stockProduct.product_id) || String(item.product_variant_id || '') !== String(stockProduct.product_variant_id || '')) {
            return item;
          }

          const nextQty = Math.min(Number(item.quantity || 0) + 1, stockProduct.quantity);

          return {
            ...item,
            quantity: nextQty,
          };
        })
      );
    } else {
      setCartItems((previous) => [
        ...previous,
        {
          product_id: stockProduct.product_id,
          product_variant_id: stockProduct.product_variant_id || '',
          cart_key: `${stockProduct.product_id}-${stockProduct.product_variant_id || 'default'}`,
          variant_name: stockProduct.variant_name || '',
          stock_id: stockProduct.stock_id,
          name: stockProduct.name,
          sku: stockProduct.sku,
          barcode: stockProduct.barcode,
          available_quantity: stockProduct.quantity,
          product_total_stock: stockProduct.product_total_stock,
          available_device_count: 0,
          is_device_tracked: false,
          selected_devices: [],
          quantity: 1,
          rate: stockProduct.sale_price,
          discount_percent: 0,
          discount_amount: 0,
        },
      ]);
    }

    setBarcodeSearch('');
    setError('');
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  const addProductToCart = () => {
    if (!formData.branch_id) {
      setError(t('common.select_branch_first'));
      return;
    }

    const exactDevice = getExactSearchDevice();

    if (exactDevice) {
      addDeviceToCart(exactDevice);
      return;
    }

    const exactProduct = getExactSearchProduct();
    const fallbackProduct = productSearchResults[0];

    addStockProductToCart(exactProduct || fallbackProduct);
  };

  const handleBarcodeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addProductToCart();
    }
  };

  const updateCartItem = (cartKey, key, value) => {
    setCartItems((previous) =>
      previous.map((item) => {
        if (String(item.cart_key || `${item.product_id}-${item.product_variant_id || 'default'}`) !== String(cartKey)) {
          return item;
        }

        if (key === 'quantity') {
          if (item.is_device_tracked) {
            return item;
          }

          const nextQty = Math.max(
            1,
            Math.min(Number(value || 1), Number(item.available_quantity || 1))
          );

          return {
            ...item,
            quantity: nextQty,
          };
        }

        return {
          ...item,
          [key]: value,
        };
      })
    );
  };

  const removeCartItem = (cartKey) => {
    setCartItems((previous) =>
      previous.filter((item) => String(item.cart_key || `${item.product_id}-${item.product_variant_id || 'default'}`) !== String(cartKey))
    );
  };

  const removeDeviceFromCart = (cartKey, deviceId) => {
    setCartItems((previous) =>
      previous
        .map((item) => {
          if (String(item.cart_key || `${item.product_id}-${item.product_variant_id || 'default'}`) !== String(cartKey)) {
            return item;
          }

          const nextDevices = (item.selected_devices || []).filter(
            (device) => String(device.id) !== String(deviceId)
          );

          return {
            ...item,
            selected_devices: nextDevices,
            quantity: item.is_device_tracked ? nextDevices.length : item.quantity,
          };
        })
        .filter((item) => !item.is_device_tracked || (item.selected_devices || []).length > 0)
    );
  };

  const lineAmount = (item) => {
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const subtotal = quantity * rate;
    const percentDiscount = subtotal * (Number(item.discount_percent || 0) / 100);
    const fixedDiscount = Number(item.discount_amount || 0);

    return Math.max(subtotal - percentDiscount - fixedDiscount, 0);
  };

  const price = useMemo(() => {
    return cartItems.reduce(
      (total, item) => total + Number(item.quantity || 0) * Number(item.rate || 0),
      0
    );
  }, [cartItems]);

  const itemDiscount = useMemo(() => {
    return cartItems.reduce((total, item) => {
      const quantity = Number(item.quantity || 0);
      const rate = Number(item.rate || 0);
      const subtotal = quantity * rate;
      const percentDiscount = subtotal * (Number(item.discount_percent || 0) / 100);
      const fixedDiscount = Number(item.discount_amount || 0);

      return total + percentDiscount + fixedDiscount;
    }, 0);
  }, [cartItems]);

  const mfsTotalAmount = useMemo(() => {
    return payments.mfs_payments.reduce((total, item) => {
      return total + Number(item.amount || 0);
    }, 0);
  }, [payments.mfs_payments]);

  const invoiceDiscountByPercent =
    price * (Number(formData.invoice_discount_percent || 0) / 100);

  const invoiceDiscountAmount =
    invoiceDiscountByPercent + Number(formData.invoice_discount_amount || 0);

  const totalDiscount = itemDiscount + invoiceDiscountAmount;
  const billAmount = Math.max(price - totalDiscount, 0);
  const finalAmount =
    billAmount + Number(previousDue || 0) + Number(formData.delivery_charge || 0);

  const paidAmount =
    Number(payments.cash || 0) +
    mfsTotalAmount +
    Number(payments.bank || 0) +
    Number(payments.card || 0) +
    Number(payments.emi || 0);

  const cashBackAmount = Math.max(paidAmount - finalAmount, 0);
  const dueAmount = Math.max(finalAmount - paidAmount, 0);

  const handlePaymentChange = (key, value) => {
    setPayments((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleMfsPaymentChange = (paymentId, key, value) => {
    setPayments((previous) => ({
      ...previous,
      mfs_payments: previous.mfs_payments.map((payment) => {
        if (payment.id !== paymentId) {
          return payment;
        }

        const updatedPayment = {
          ...payment,
          [key]: value,
        };

        if (key === 'mfs_method' && value !== 'other_mfs') {
          updatedPayment.other_mfs_name = '';
        }

        return updatedPayment;
      }),
    }));
  };

  const addMfsPaymentRow = () => {
    setPayments((previous) => ({
      ...previous,
      mfs_payments: [...previous.mfs_payments, createEmptyMfsPayment()],
    }));
  };

  const removeMfsPaymentRow = (paymentId) => {
    setPayments((previous) => {
      const nextRows = previous.mfs_payments.filter((payment) => payment.id !== paymentId);

      return {
        ...previous,
        mfs_payments: nextRows.length > 0 ? nextRows : [createEmptyMfsPayment()],
      };
    });
  };

  const buildPaymentPayload = () => {
    const paymentPayload = [];

    if (Number(payments.cash || 0) > 0) {
      paymentPayload.push({
        payment_method: 'cash',
        provider_name: 'Cash',
        amount: Number(payments.cash || 0),
      });
    }

    payments.mfs_payments.forEach((mfsPayment) => {
      if (Number(mfsPayment.amount || 0) <= 0) {
        return;
      }

      const selectedMfsLabel = getMfsLabel(mfsPayment.mfs_method);

      paymentPayload.push({
        payment_method: mfsPayment.mfs_method,
        provider_name:
          mfsPayment.mfs_method === 'other_mfs'
            ? mfsPayment.other_mfs_name || 'Other MFS'
            : selectedMfsLabel,
        amount: Number(mfsPayment.amount || 0),
      });
    });

    if (Number(payments.bank || 0) > 0) {
      paymentPayload.push({
        payment_method: 'bank',
        provider_name: 'Bank',
        amount: Number(payments.bank || 0),
      });
    }

    if (Number(payments.card || 0) > 0) {
      paymentPayload.push({
        payment_method: 'card',
        provider_name: 'Card',
        amount: Number(payments.card || 0),
      });
    }

    if (Number(payments.emi || 0) > 0) {
      const emiBankName = payments.emi_bank === '__custom__'
        ? (payments.emi_custom_bank || 'Custom Bank').trim()
        : String(payments.emi_bank || '').trim();
      const emiMonths = Number(
        payments.emi_months === '__custom__' ? payments.emi_custom_months : payments.emi_months
      ) || null;

      paymentPayload.push({
        payment_method: 'emi',
        provider_name: emiBankName || 'EMI',
        amount: Number(payments.emi || 0),
        emi_bank_name: emiBankName || null,
        emi_months: emiMonths,
        emi_reference: String(payments.emi_reference || '').trim() || null,
      });
    }

    return paymentPayload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.branch_id) {
      setError('Please select branch.');
      return;
    }

    if (cartItems.length === 0) {
      setError('Please add at least one product.');
      return;
    }

    const invalidTrackedItem = cartItems.find(
      (item) => item.is_device_tracked && (item.selected_devices || []).length !== Number(item.quantity || 0)
    );

    if (invalidTrackedItem) {
      setError(t('sales.errors.imei_count_mismatch', { name: invalidTrackedItem.name }));
      return;
    }

    try {
      setLoading(true);
      setError('');
      setMessage('');

      const payload = {
        branch_id: formData.branch_id,
        customer_name: formData.customer_name || null,
        customer_phone: formData.customer_phone || null,
        invoice_discount_percent: Number(formData.invoice_discount_percent || 0),
        invoice_discount_amount: Number(formData.invoice_discount_amount || 0),
        delivery_charge: Number(formData.delivery_charge || 0),
        customer_email: formData.customer_email?.trim() || null,
        payment_received_by: formData.payment_received_by || null,
        home_delivery: formData.home_delivery,
        send_sms: formData.send_sms,
        send_email: formData.send_email,
        note: formData.note || null,
        items: cartItems.map((item) => ({
          product_id: item.product_id,
          product_variant_id: item.product_variant_id || null,
          quantity: Number(item.quantity || 1),
          rate: Number(item.rate || 0),
          discount_percent: Number(item.discount_percent || 0),
          discount_amount: Number(item.discount_amount || 0),
          device_unit_ids: (item.selected_devices || []).map((device) => device.id),
        })),
        payments: buildPaymentPayload(),
      };

      const response = await saleService.createSale(payload);
      const savedSale =
        response?.data?.data?.id
          ? response.data.data
          : response?.data?.sale?.id
            ? response.data.sale
            : response?.data?.id
              ? response.data
              : null;

      const saleId = savedSale?.id;

      setMessage('Sale saved successfully. Invoice page opening for print.');

      if (saleId) {
        if (formData.send_sms || formData.send_email) {
          try {
            await corporateOpsService.sendInvoice(saleId, {
              send_sms: formData.send_sms,
              send_email: formData.send_email,
              attach_pdf: formData.attach_invoice_pdf,
            });
          } catch (communicationError) {
            console.error('Invoice SMS/Email send failed:', communicationError);
          }
        }

        navigate(`/sales/${saleId}/invoice`, { state: { autoPrint: true } });
        return;
      }

      navigate('/sales');
    } catch (err) {
      console.error('POS sale save error:', err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const cancelInvoice = () => {
    setCartItems([]);
    setPayments({
      cash: '',
      mfs_payments: [createEmptyMfsPayment()],
      bank: '',
      card: '',
      emi: '',
      emi_bank: emiBanks[0]?.bank_name ? String(emiBanks[0].bank_name) : '',
      emi_custom_bank: '',
      emi_months: '12',
      emi_custom_months: '',
      emi_reference: '',
    });
    setBarcodeSearch('');
    setError('');
    setMessage('');
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  const formatPrice = (amount) => {
    return `BDT ${formatBdInteger(Math.round(Number(amount || 0))) || '0'}`;
  };

  return (
    <div className="p-4 md:p-6">
      <NstPageHeader icon={NstHdrShoppingCart} title={t('sales.pos_title')} subtitle={t('sales.pos_subtitle')} actions={<><Link
          to="/sales"
          className="inline-flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
        >
          Back to Sales
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

      <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)] mb-4">Customer & Branch</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className={labelClass()}>Branch *</label>
                <select
                  name="branch_id"
                  value={formData.branch_id}
                  onChange={handleChange}
                  className={inputClass()}
                  required
                >
                  <option value="">Select Branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                      {branch.code ? ` (${branch.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass()}>Customer Phone</label>
                <input
                  name="customer_phone"
                  value={formData.customer_phone}
                  onChange={handleChange}
                  onBlur={handleCustomerPhoneBlur}
                  placeholder="01XXXXXXXXX"
                  className={inputClass()}
                />
                {customerLoading && (
                  <p className="mt-1 text-xs text-gray-400">Checking previous due...</p>
                )}
              </div>

              <div>
                <label className={labelClass()}>Customer Name</label>
                <input
                  name="customer_name"
                  value={formData.customer_name}
                  onChange={handleChange}
                  placeholder="Customer name"
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass()}>Customer Email (Optional)</label>
                <input
                  type="email"
                  name="customer_email"
                  value={formData.customer_email || ''}
                  onChange={handleChange}
                  placeholder="customer@example.com"
                  className={inputClass()}
                />
              </div>
              <div>
                <label className={labelClass()}>Payment Received By</label>
                <select
                  name="payment_received_by"
                  value={formData.payment_received_by}
                  onChange={handleChange}
                  className={inputClass()}
                >
                  <option value="">Current User</option>
                  {paymentReceivers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="mb-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)]">Product / IMEI / Barcode Search</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {t('sales.search_help')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => barcodeInputRef.current?.focus()}
                className="rounded-lg bg-[var(--nst-dashboard-primary-soft)] px-4 py-2 text-sm font-semibold text-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary-soft)]"
              >
                Focus Scanner
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeSearch}
                onChange={(e) => setBarcodeSearch(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                placeholder={
                  formData.branch_id
                    ? 'IMEI / Device Barcode / Product Barcode / SKU / Product name...'
                    : t('sales.select_branch_placeholder')
                }
                className="md:col-span-4 w-full rounded-lg border border-gray-200 px-4 py-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
                disabled={!formData.branch_id || productsLoading}
                autoComplete="off"
              />

              <button
                type="button"
                onClick={addProductToCart}
                disabled={!formData.branch_id || productsLoading}
                className="rounded-lg bg-[var(--nst-dashboard-secondary)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--nst-dashboard-secondary)] disabled:opacity-60"
              >
                Add / Enter
              </button>
            </div>

            {(productsLoading || devicesLoading) && (
              <div className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Branch stock and available IMEI/device loading...
              </div>
            )}

            {formData.branch_id && !productsLoading && enrichedBranchProducts.length === 0 && (
              <div className="mb-4 rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
                {t('sales.no_branch_stock_products')}
              </div>
            )}

            {formData.branch_id && deviceSearchResults.length > 0 && barcodeSearch.trim() && (
              <div className="mb-5 rounded-xl border border-emerald-100 overflow-hidden">
                <div className="bg-emerald-50 px-4 py-2 text-xs font-bold uppercase text-emerald-700">
                  {t('sales.device_results_heading')}
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-emerald-100">
                  {deviceSearchResults.map((device) => (
                    <button
                      key={`device-${device.id}`}
                      type="button"
                      onClick={() => addDeviceToCart(device)}
                      className="w-full px-4 py-3 text-left hover:bg-emerald-50 flex flex-col md:flex-row md:items-center md:justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
                    >
                      <div>
                        <p className="font-bold text-[var(--nst-dashboard-text)]">{device.product_name}</p>
                        <p className="text-xs text-gray-500">
                          IMEI 1: {device.imei_1 || '-'} | IMEI 2: {device.imei_2 || '-'} | Barcode: {device.barcode || '-'}
                        </p>
                      </div>

                      <div className="text-xs md:text-right">
                        <p className="font-bold text-emerald-700">Available</p>
                        <p className="font-bold text-gray-700">{formatPrice(device.sale_price)}</p>
                        <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">Add to Cart</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {formData.branch_id && productSearchResults.length > 0 && (
              <div className="mb-5 rounded-xl border border-gray-100 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase text-gray-500">
                  {t('sales.product_results_heading')}
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {productSearchResults.map((item) => (
                    <button
                      key={`${item.stock_id}-${item.product_id}`}
                      type="button"
                      onClick={() => addStockProductToCart(item)}
                      className="w-full px-4 py-3 text-left hover:bg-[var(--nst-dashboard-primary-soft)] flex flex-col md:flex-row md:items-center md:justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)]"
                    >
                      <div>
                        <p className="font-bold text-[var(--nst-dashboard-text)]">{item.name}</p>
                        <p className="text-xs text-gray-500">
                          Barcode: {item.barcode || '-'} | SKU: {item.sku || '-'} | Brand: {item.brand || '-'}
                        </p>
                        {item.is_device_tracked && (
                          <p className="mt-1 text-xs font-bold text-emerald-700">
                            IMEI tracked: Available IMEI {item.available_device_count}
                          </p>
                        )}
                      </div>

                      <div className="text-xs md:text-right">
                        <p className="font-bold text-gray-700">Stock: {item.quantity}</p>
                        <p className="font-bold text-green-700">{formatPrice(item.sale_price)}</p>
                        <span className="mt-2 inline-flex rounded-full bg-[var(--nst-dashboard-primary-soft)] px-3 py-1 text-[11px] font-black text-[var(--nst-dashboard-primary)]">Add to Cart</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {formData.branch_id && barcodeSearch.trim() && !productsLoading && !devicesLoading && deviceSearchResults.length === 0 && productSearchResults.length === 0 && (
              <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {t('sales.search_no_results')}
              </div>
            )}

            {cartItems.length === 0 ? (
              <div className="rounded-lg bg-gray-50 p-8 text-center text-gray-500">No product added.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Product / IMEI</th>
                      <th className="px-4 py-3">Quantity</th>
                      <th className="px-4 py-3">Rate</th>
                      <th className="px-4 py-3">Discount (%)</th>
                      <th className="px-4 py-3">Discount Amount</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {cartItems.map((item) => (
                      <tr key={item.product_id}>
                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-[var(--nst-dashboard-text)]">{item.name}</p>
                          <p className="text-xs text-gray-400">
                            SKU: {item.sku} | Barcode: {item.barcode || '-'} | Variant Stock: {item.available_quantity} | Total Stock: {item.product_total_stock || item.available_quantity}
                          </p>

                          {item.is_device_tracked && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(item.selected_devices || []).map((device) => (
                                <span
                                  key={device.id}
                                  className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"
                                >
                                  {device.imei_1 || device.imei_2 || device.barcode || `Device #${device.id}`}
                                  <button
                                    type="button"
                                    onClick={() => removeDeviceFromCart(item.cart_key || `${item.product_id}-${item.product_variant_id || 'default'}`, device.id)}
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 align-top">
                          <input
                            type="number"
                            min="1"
                            max={item.available_quantity}
                            value={item.quantity}
                            onChange={(e) => updateCartItem(item.cart_key || `${item.product_id}-${item.product_variant_id || 'default'}`, 'quantity', e.target.value)}
                            className={smallInputClass()}
                            readOnly={item.is_device_tracked}
                          />
                          {item.is_device_tracked && (
                            <p className="mt-1 text-[11px] text-emerald-600">Quantity = selected IMEI</p>
                          )}
                        </td>

                        <td className="px-4 py-3 align-top">
                          <BdMoneyInput
                            value={item.rate}
                            onValueChange={(value) => updateCartItem(item.cart_key || `${item.product_id}-${item.product_variant_id || 'default'}`, 'rate', value)}
                            className={smallInputClass()}
                          />
                        </td>

                        <td className="px-4 py-3 align-top">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={item.discount_percent}
                            onChange={(e) => updateCartItem(item.cart_key || `${item.product_id}-${item.product_variant_id || 'default'}`, 'discount_percent', e.target.value)}
                            className={smallInputClass()}
                          />
                        </td>

                        <td className="px-4 py-3 align-top">
                          <BdMoneyInput
                            value={item.discount_amount}
                            onValueChange={(value) => updateCartItem(item.cart_key || `${item.product_id}-${item.product_variant_id || 'default'}`, 'discount_amount', value)}
                            className={smallInputClass()}
                          />
                        </td>

                        <td className="px-4 py-3 align-top font-bold text-gray-800">
                          {formatPrice(lineAmount(item))}
                        </td>

                        <td className="px-4 py-3 align-top text-right">
                          <button
                            type="button"
                            onClick={() => removeCartItem(item.cart_key || `${item.product_id}-${item.product_variant_id || 'default'}`)}
                            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-fit">
          <h2 className="text-lg font-bold text-[var(--nst-dashboard-text)] mb-4">Invoice Summary</h2>

          <div className="space-y-4">
            <SummaryRow label="Price" value={formatPrice(price)} />
            <SummaryRow label="Item Discount" value={formatPrice(itemDiscount)} />

            <div className="grid grid-cols-2 gap-3 items-center">
              <label className="font-semibold text-gray-700">Invoice Discount %</label>
              <input
                type="number"
                name="invoice_discount_percent"
                value={formData.invoice_discount_percent}
                onChange={handleChange}
                min="0"
                max="100"
                step="1"
                className={inputClass()}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <label className="font-semibold text-gray-700">Invoice Discount Amount</label>
              <BdMoneyInput
                name="invoice_discount_amount"
                value={formData.invoice_discount_amount}
                onChange={handleChange}
                className={inputClass()}
              />
            </div>

            <SummaryRow label="Total Discount" value={formatPrice(totalDiscount)} />
            <SummaryRow label="Bill Amount" value={formatPrice(billAmount)} />
            <SummaryRow label="Previous Due" value={formatPrice(previousDue)} warning={previousDue > 0} />
            <SummaryRow label="Delivery Charge" value={formatPrice(formData.delivery_charge)} />
            <SummaryRow label="Final Amount" value={formatPrice(finalAmount)} danger />

            <div className="pt-2 border-t border-gray-100">
              <p className="mb-3 text-sm font-bold text-green-700">Payment Breakdown</p>
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <label className="font-semibold text-gray-700">Cash Amount</label>
              <BdMoneyInput
                value={payments.cash}
                onValueChange={(value) => handlePaymentChange('cash', value)}
                className={inputClass()}
              />
            </div>

            <div className="rounded-lg border border-green-100 bg-green-50 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-green-700">Multiple MFS Payments</p>
                  <p className="text-xs text-green-600">{t('sales.mfs_help')}</p>
                </div>

                <button
                  type="button"
                  onClick={addMfsPaymentRow}
                  className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-100"
                >
                  + Add MFS
                </button>
              </div>

              {payments.mfs_payments.map((mfsPayment, index) => (
                <div key={mfsPayment.id} className="rounded-lg bg-white border border-green-100 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-[var(--nst-dashboard-text)]">MFS Payment {index + 1}</p>

                    <button
                      type="button"
                      onClick={() => removeMfsPaymentRow(mfsPayment.id)}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-green-700 mb-1">MFS Method</label>
                      <select
                        value={mfsPayment.mfs_method}
                        onChange={(e) => handleMfsPaymentChange(mfsPayment.id, 'mfs_method', e.target.value)}
                        className={inputClass()}
                      >
                        {mfsOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-green-700 mb-1">
                        {mfsPayment.mfs_method === 'other_mfs'
                          ? 'Other MFS Amount'
                          : `${getMfsLabel(mfsPayment.mfs_method)} Amount`}
                      </label>
                      <BdMoneyInput
                        value={mfsPayment.amount}
                        onValueChange={(value) => handleMfsPaymentChange(mfsPayment.id, 'amount', value)}
                        className={inputClass()}
                      />
                    </div>
                  </div>

                  {mfsPayment.mfs_method === 'other_mfs' && (
                    <div>
                      <label className="block text-xs font-bold text-green-700 mb-1">Custom MFS Name</label>
                      <input
                        type="text"
                        value={mfsPayment.other_mfs_name}
                        onChange={(e) => handleMfsPaymentChange(mfsPayment.id, 'other_mfs_name', e.target.value)}
                        placeholder="Example: Tap, OK Wallet"
                        className={inputClass()}
                      />
                    </div>
                  )}
                </div>
              ))}

              <SummaryRow label="Total MFS Amount" value={formatPrice(mfsTotalAmount)} success />
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <label className="font-semibold text-gray-700">Bank Amount</label>
              <BdMoneyInput
                value={payments.bank}
                onValueChange={(value) => handlePaymentChange('bank', value)}
                className={inputClass()}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <label className="font-semibold text-gray-700">Card Amount</label>
              <BdMoneyInput
                value={payments.card}
                onValueChange={(value) => handlePaymentChange('card', value)}
                className={inputClass()}
              />
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-blue-700 mb-1">EMI Amount</label>
                  <BdMoneyInput
                    value={payments.emi}
                    onValueChange={(value) => handlePaymentChange('emi', value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-700 mb-1">EMI Bank</label>
                  <select
                    value={payments.emi_bank}
                    onChange={(e) => handlePaymentChange('emi_bank', e.target.value)}
                    className={inputClass()}
                  >
                    <option value="">Select bank</option>
                    {emiBanks.map((bank) => (
                      <option key={bank.id || bank.bank_name} value={bank.bank_name}>{bank.bank_name}</option>
                    ))}
                    <option value="__custom__">Custom Bank...</option>
                  </select>
                </div>
              </div>

              {payments.emi_bank === '__custom__' && (
                <div>
                  <label className="block text-xs font-bold text-blue-700 mb-1">Custom Bank Name</label>
                  <input
                    type="text"
                    value={payments.emi_custom_bank}
                    onChange={(e) => handlePaymentChange('emi_custom_bank', e.target.value)}
                    placeholder="Bank name"
                    className={inputClass()}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-blue-700 mb-1">EMI Tenure</label>
                  <select
                    value={payments.emi_months}
                    onChange={(e) => handlePaymentChange('emi_months', e.target.value)}
                    className={inputClass()}
                  >
                    {[3, 6, 9, 12, 18, 24, 30, 36].map((months) => (
                      <option key={months} value={String(months)}>{months} Months</option>
                    ))}
                    <option value="__custom__">Custom Months...</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-700 mb-1">Reference (Optional)</label>
                  <input
                    type="text"
                    value={payments.emi_reference}
                    onChange={(e) => handlePaymentChange('emi_reference', e.target.value)}
                    placeholder="Card / Bank reference"
                    className={inputClass()}
                  />
                </div>
              </div>

              {payments.emi_months === '__custom__' && (
                <div>
                  <label className="block text-xs font-bold text-blue-700 mb-1">Custom EMI Months</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={payments.emi_custom_months}
                    onChange={(e) => handlePaymentChange('emi_custom_months', e.target.value)}
                    className={inputClass()}
                  />
                </div>
              )}
            </div>

            <SummaryRow label="Paid Amount" value={formatPrice(paidAmount)} />

            <SummaryRow
              label="Cash Back / Due Amount"
              value={
                cashBackAmount > 0
                  ? `Cash Back: ${formatPrice(cashBackAmount)}`
                  : `Due: ${formatPrice(dueAmount)}`
              }
              warning={dueAmount > 0}
              success={cashBackAmount > 0}
            />

            <div className="grid grid-cols-2 gap-3 items-center">
              <label className="font-semibold text-gray-700">Delivery Charge</label>
              <BdMoneyInput
                name="delivery_charge"
                value={formData.delivery_charge}
                onChange={handleChange}
                className={inputClass()}
              />
            </div>

            <label className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                name="home_delivery"
                checked={formData.home_delivery}
                onChange={handleChange}
              />
              <span className="font-semibold text-gray-700">Home Delivery</span>
            </label>

            <div className="pt-2 space-y-3 rounded-xl bg-[var(--nst-dashboard-primary-soft)] border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] p-3">
              <p className="font-bold text-[var(--nst-dashboard-primary)]">Customer Communication</p>
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.send_sms === true}
                  onChange={(e) => setFormData((previous) => ({ ...previous, send_sms: e.target.checked }))}
                />
                Send invoice SMS with public invoice link
              </label>
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.send_email === true}
                  onChange={(e) => setFormData((previous) => ({ ...previous, send_email: e.target.checked }))}
                />
                Send smart invoice email
              </label>
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.attach_invoice_pdf === true}
                  onChange={(e) => setFormData((previous) => ({ ...previous, attach_invoice_pdf: e.target.checked }))}
                />
                Attach invoice PDF to email
              </label>
              <p className="text-xs text-[var(--nst-dashboard-primary)]">Email only works if customer profile has email and SMTP is configured in Settings &gt; Communication.</p>
            </div>

            <textarea
              name="note"
              value={formData.note}
              onChange={handleChange}
              rows="3"
              placeholder="Invoice note..."
              className={inputClass()}
            />

            <div className="grid grid-cols-2 gap-3 pt-4">
              <button
                type="button"
                onClick={cancelInvoice}
                className="rounded-lg bg-pink-500 px-4 py-3 text-sm font-semibold text-white hover:bg-pink-600"
              >
                CANCEL INVOICE
              </button>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className={`nst-expand-action nst-expand-action--pos ${loading ? 'is-loading' : ''}`}
              >
                <span className="nst-expand-action__label">{loading ? 'Saving...' : 'SAVE and PRINT'}</span>
                <span className="nst-expand-action__icon" aria-hidden="true">
                  <svg className="nst-expand-action__arrow" viewBox="0 0 32 32" fill="currentColor">
                    <path d="M8.489 31.975c-.271 0-.549-.107-.757-.316a1.073 1.073 0 0 1 0-1.515L21.99 15.88 7.94 1.83a1.073 1.073 0 0 1 1.515-1.515l14.807 14.807a1.073 1.073 0 0 1 0 1.515L9.247 31.659a1.07 1.07 0 0 1-.758.316Z" />
                  </svg>
                  <span className="nst-expand-action__loader" />
                </span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

function SummaryRow({ label, value, danger = false, warning = false, success = false }) {
  let className = 'grid grid-cols-2 gap-3 items-center rounded-lg bg-gray-50 p-3';

  if (danger) {
    className = 'grid grid-cols-2 gap-3 items-center rounded-lg bg-red-50 p-3';
  }

  if (warning) {
    className = 'grid grid-cols-2 gap-3 items-center rounded-lg bg-yellow-50 p-3';
  }

  if (success) {
    className = 'grid grid-cols-2 gap-3 items-center rounded-lg bg-green-50 p-3';
  }

  return (
    <div className={className}>
      <span className="font-bold text-gray-700">{label}</span>
      <span className="font-bold text-[var(--nst-dashboard-text)]">{value}</span>
    </div>
  );
}

function labelClass() {
  return 'block text-sm font-semibold text-gray-700 mb-2';
}

function inputClass() {
  return 'w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)] bg-white';
}

function smallInputClass() {
  return 'w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)] bg-white';
}

export default SaleForm;

