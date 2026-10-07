import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { productService } from '../../services/productService';
import { categoryService } from '../../services/categoryService';
import { brandService } from '../../services/brandService';
import { supplierService } from '../../services/supplierService';
import { branchService } from '../../services/branchService';
import {
  DescriptionSeoFields as DescriptionSeoStep,
  FeaturesFaqFields as FeaturesFaqStep,
  SpecificationRowsFields as ManualSpecificationsStep,
  AddonRowsFields as AddonsOnlyStep,
  VideoFields as VideoStep,
  Field,
  Textarea,
  Select,
} from '../../components/product-content/ProductContentFields';
import { slugify } from '../../components/product-content/productContentUtils';
import { productFormStyles as styles } from '../../components/product-content/productFormStyles';
import productDraftService from '../../services/productDraftService';
import ProductSpecificationStudio from './components/ProductSpecificationStudio';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { PackageCheck as NstHdrPackageCheck } from 'lucide-react';
import { t, useI18n } from '../../i18n';

const PRIMARY = 'var(--nst-dashboard-primary)';
const steps = [
  { key: 'basic' },
  { key: 'variants' },
  { key: 'content' },
  { key: 'review' },
];

const defaultOptionSets = {
  color: ['Silver', 'Deep Blue', 'Cosmic Orange', 'Black', 'White', 'Light Blue', 'Cobalt Violet'],
  region: ['JP/MEA', 'Global Variant', 'HK / CH', 'USA', 'Dubai', 'Australia', 'Singapore'],
  sim: ['Dual e-SIM', 'Sim + e-SIM', 'Dual Sim', 'Single Sim'],
  ram: ['Default', '2GB', '4GB', '6GB', '8GB', '12GB', '16GB', '24GB'],
  storage: ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'],
  warranty: ['Official Warranty 1 Year', 'Shop Warranty 7 Days', 'Shop Warranty 30 Days', 'No Warranty'],
  status: [
    { value: 'inactive', label: 'Inactive' },
    { value: 'not_activated', label: 'Not Activated' },
    { value: 'boxed', label: 'Boxed' },
    { value: 'active', label: 'Active' },
    { value: 'activated', label: 'Activated' },
    { value: 'open_box', label: 'Open Box' },
  ],
};

const defaultForm = {
  brand_id: '',
  category_id: '',
  branch_id: '',
  supplier_id: '',
  name: '',
  minimum_booking_type: 'percentage',
  minimum_booking_value: '10',
  booking_amount: '',
  emi_possible: 'yes',
  condition: 'new',
  product_status: 'active',
  website_published: true,
  allow_preorder: true,
  show_price_at_zero_stock: true,
  show_branch: true,
  activation_status: 'inactive',
  box_included: true,
  physical_condition: '',
  condition_grade: '',
  official_warranty: 'Official Warranty 1 Year',
  shop_warranty: 'Shop Warranty 3/7 Days',
  warranty_notes: '',
  whats_in_box: '',
  short_description: '',
  used_notes: '',
  description: '',
  meta_title: '',
  meta_description: '',
  seo_keywords: '',
  slug: '',
  youtube_video_url: '',
  video_watermark: true,
  key_features: [''],
  faqs: [{ question: '', answer: '' }],
  specifications: [
    { name: 'Display', value: '' },
    { name: 'Chipset', value: '' },
    { name: 'Storage', value: '' },
    { name: 'Camera', value: '' },
    { name: 'Battery', value: '' },
  ],
  add_ons: [{ name: 'None', price: '0', status: 'active' }],
};

const makeSku = () => `NST-${Math.floor(100000000 + Math.random() * 900000000)}`;

const formatSkuInput = (value) => {
  const digits = String(value || '')
    .replace(/^NST-/i, '')
    .replace(/\D/g, '')
    .slice(0, 9);

  return digits ? `NST-${digits}` : '';
};

const normalizeSku = (value) => {
  const formatted = formatSkuInput(value);
  return formatted || makeSku();
};

const isValidNstSku = (value) => /^NST-\d{9}$/.test(String(value || '').trim());

const makeVariantGroupKey = () => `vg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const newDevice = (copy = null, index = 0) => {
  const base = copy || {};
  const activationStatus = base.activation_status || base.status || 'inactive';

  return {
    id: base.id || null,
    variant_id: base.variant_id || base.id || null,
    source_variant_id: base.source_variant_id || base.variant_id || base.id || null,
    device_unit_id: base.device_unit_id || null,
    variant_group_key: base.variant_group_key || makeVariantGroupKey(),
    client_id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${index}`,
    sku_type: base.sku_type || 'random',
    sku: base.sku || makeSku(),
    model_number: base.model_number || '',
    status: base.variant_status || 'active',
    imei_1: base.imei_1 || '',
    imei_2: base.imei_2 || '',
    color_name: base.color_name || 'Silver',
    region: base.region || 'Global Variant',
    sim_network: base.sim_network || 'Dual Sim',
    ram: base.ram || 'Default',
    storage: base.storage || '256GB',
    battery_health: ['inactive', 'not_activated', 'boxed'].includes(activationStatus) ? '100' : (base.battery_health || '100'),
    purchase_price: base.purchase_price || '',
    sale_price: base.sale_price || '',
    market_price: base.market_price || '',
    warranty: base.warranty || 'Shop Warranty 7 Days',
    short_note: base.short_note || '',
    variant_status: base.variant_status || base.status || 'active',
    stock_state: base.stock_state || 'in_stock',
    minimum_booking_type: base.minimum_booking_type || 'percentage',
    minimum_booking_value: base.minimum_booking_value || '10',
    emi_available: base.emi_available ?? true,
    allow_preorder: base.allow_preorder ?? true,
    serial_number: base.serial_number || '',
    activation_status: activationStatus,
    box_included: base.box_included ?? true,
    physical_condition: base.physical_condition || '',
    condition_grade: base.condition_grade || '',
    official_warranty: base.official_warranty || '',
    shop_warranty: base.shop_warranty || '',
    warranty_duration: base.warranty_duration || '',
    warranty_notes: base.warranty_notes || '',
    service_status: base.service_status || 'no_service',
    supplier_reference: base.supplier_reference || '',
    purchase_reference: base.purchase_reference || '',
    existing_images: Array.isArray(base.existing_images) ? base.existing_images : [],
    removed_image_ids: [],
    gallery_image_ids: Array.isArray(base.gallery_image_ids) ? base.gallery_image_ids : [],
    images: [],
    image_previews: [],
  };
};

const extractList = (response) => {
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const numberFormat = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('en-BD');
};




const firstFilled = (...values) => values.find((value) => String(value || '').trim()) || '';

export default function ProductForm() {
  useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const draftKey = isEditMode ? `product-edit-${id}` : 'product-create';

  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState(defaultForm);
  const [devices, setDevices] = useState([newDevice(null, 0)]);
  const [removedDeviceUnitIds, setRemovedDeviceUnitIds] = useState([]);
  const [variantOptions, setVariantOptions] = useState(defaultOptionSets);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [productVideo, setProductVideo] = useState(null);
  const [productVideoPreview, setProductVideoPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEditMode);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [seoTouched, setSeoTouched] = useState({ title: false, slug: false, description: false, keywords: false });

  const selectedBrand = useMemo(() => brands.find((brand) => String(brand.id) === String(form.brand_id)), [brands, form.brand_id]);
  const isApple = (selectedBrand?.name || '').toLowerCase().includes('apple') || (form.name || '').toLowerCase().includes('iphone');

  const selectedCategory = useMemo(() => categories.find((category) => String(category.id) === String(form.category_id)), [categories, form.category_id]);

  const seoSuggestion = useMemo(() => {
    const firstDevice = devices[0] || {};
    const brandName = selectedBrand?.name || '';
    const categoryName = selectedCategory?.name || 'Mobile Phone';
    const deviceName = form.name || '';
    const ramPart = firstDevice.ram && firstDevice.ram !== 'Default' ? firstDevice.ram : '';
    const titleParts = [brandName, deviceName, ramPart, firstDevice.storage, firstDevice.region].filter(Boolean);
    const title = `${titleParts.join(' ')} Price in Bangladesh`.replace(/\s+/g, ' ').trim();
    const slug = slugify([brandName, deviceName, ramPart, firstDevice.storage, firstDevice.region, firstDevice.color_name].filter(Boolean).join(' '));
    const description = `Buy ${titleParts.join(' ')} from New Singapur Telecom. ${firstDevice.color_name ? `Color: ${firstDevice.color_name}. ` : ''}${firstDevice.sim_network ? `SIM: ${firstDevice.sim_network}. ` : ''}Warranty, EMI, booking and after-sales support available.`.replace(/\s+/g, ' ').trim();
    const keywords = [
      brandName,
      deviceName,
      categoryName,
      firstDevice.storage,
      firstDevice.region,
      firstDevice.color_name,
      `${deviceName} price in Bangladesh`,
      'New Singapur Telecom',
    ].filter(Boolean).join(', ');

    return { title, slug, description, keywords };
  }, [selectedBrand, selectedCategory, form.name, devices]);

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    if (isEditMode) {
      loadProduct();
    }
  }, [id]);

  useEffect(() => {
    if (isEditMode) return;
    productDraftService.get(draftKey)
      .then((response) => {
        const draft = response?.data?.data || response?.data || {};
        const payload = draft.payload || {};
        if (payload.form) setForm((previous) => ({ ...previous, ...payload.form, condition: isEditMode ? (payload.form.condition || previous.condition) : 'new' }));
        if (Array.isArray(payload.devices) && payload.devices.length) setDevices(payload.devices.map((device, index) => newDevice(device, index)));
        if (Number.isInteger(payload.activeStep)) setActiveStep(Math.max(0, Math.min(steps.length - 1, payload.activeStep)));
        setSuccess(t('product_form.messages.draft_restored'));
      })
      .catch(() => {});
  }, [draftKey, isEditMode]);

  useEffect(() => {
    if (isApple) {
      setDevices((previous) => previous.map((device) => ({ ...device, ram: device.ram || 'Default' })));
    }
  }, [isApple]);


  useEffect(() => {
    setForm((previous) => {
      const next = { ...previous };
      let changed = false;

      if (!seoTouched.title && !previous.meta_title && seoSuggestion.title) {
        next.meta_title = seoSuggestion.title;
        changed = true;
      }
      if (!seoTouched.slug && !previous.slug && seoSuggestion.slug) {
        next.slug = seoSuggestion.slug;
        changed = true;
      }
      if (!seoTouched.description && !previous.meta_description && seoSuggestion.description) {
        next.meta_description = seoSuggestion.description;
        changed = true;
      }
      if (!seoTouched.keywords && !previous.seo_keywords && seoSuggestion.keywords) {
        next.seo_keywords = seoSuggestion.keywords;
        changed = true;
      }

      return changed ? next : previous;
    });
  }, [seoSuggestion, seoTouched]);

  const loadOptions = async () => {
    try {
      const [brandResponse, categoryResponse, supplierResponse, branchResponse] = await Promise.allSettled([
        brandService.getAllBrands({ status: 'active', limit: 500 }),
        categoryService.getAllCategories({ status: 'active', limit: 500 }),
        supplierService.getAllSuppliers({ status: 'active', limit: 500 }),
        branchService.getAllBranches({ status: 'active', limit: 500 }),
      ]);

      if (brandResponse.status === 'fulfilled') setBrands(extractList(brandResponse.value));
      if (categoryResponse.status === 'fulfilled') setCategories(extractList(categoryResponse.value));
      if (supplierResponse.status === 'fulfilled') setSuppliers(extractList(supplierResponse.value));
      if (branchResponse.status === 'fulfilled') setBranches(extractList(branchResponse.value));
    } catch (err) {
      setError(t('product_form.errors.options_load_failed'));
    }
  };

  const loadProduct = async () => {
    try {
      setPageLoading(true);
      const response = await productService.getProduct(id);
      const product = response.data || response;
      const productVariants = Array.isArray(product.variants) && product.variants.length ? product.variants : [];

      setForm((previous) => ({
        ...previous,
        brand_id: product.brand_id || product.brand_info?.id || '',
        category_id: product.category_id || product.category_info?.id || '',
        supplier_id: product.supplier_id || product.supplier_info?.id || '',
        branch_id: product.branch_id || product.page_options?.branch_id || productVariants?.[0]?.branch_id || '',
        name: product.name || '',
        minimum_booking_type: product.minimum_booking_type || 'percentage',
        minimum_booking_value: product.minimum_booking_value || product.minimum_booking_amount || '10',
        booking_amount: product.minimum_booking_amount || '',
        emi_possible: product.page_options?.emi_possible || 'yes',
        condition: ['used', 'pre_owned', 'refurbished'].includes(String(product.condition || product.product_type || '').toLowerCase()) ? String(product.condition || product.product_type).toLowerCase() : 'new',
        product_status: product.status || 'active',
        website_published: product.website_published ?? product.page_options?.website_published ?? true,
        allow_preorder: product.allow_preorder ?? product.page_options?.allow_preorder ?? true,
        show_price_at_zero_stock: product.page_options?.show_price_at_zero_stock !== false,
        show_branch: product.page_options?.show_branch !== false,
        activation_status: product.activation_status || 'inactive',
        box_included: product.box_included ?? true,
        physical_condition: product.physical_condition || '',
        condition_grade: product.condition_grade || '',
        official_warranty: product.official_warranty || 'Official Warranty 1 Year',
        shop_warranty: product.shop_warranty || 'Shop Warranty 3/7 Days',
        warranty_notes: product.warranty_notes || '',
        whats_in_box: product.whats_in_box || '',
        short_description: product.short_description || '',
        used_notes: product.page_options?.used_notes || '',
        description: product.description || '',
        meta_title: product.meta_title || '',
        meta_description: product.meta_description || '',
        seo_keywords: product.seo_keywords || '',
        slug: product.slug || '',
        youtube_video_url: product.page_options?.youtube_video_url || '',
        video_watermark: product.page_options?.video_watermark !== false,
        key_features: Array.isArray(product.key_features) && product.key_features.length ? product.key_features : [''],
        faqs: Array.isArray(product.faqs) && product.faqs.length ? product.faqs : [{ question: '', answer: '' }],
        specifications: Array.isArray(product.specifications) && product.specifications.length ? product.specifications : previous.specifications,
        add_ons: Array.isArray(product.add_ons) && product.add_ons.length ? product.add_ons : previous.add_ons,
      }));

      setSeoTouched({
        title: Boolean(product.meta_title),
        slug: Boolean(product.slug),
        description: Boolean(product.meta_description),
        keywords: Boolean(product.seo_keywords),
      });

      if (productVariants.length) {
        const loadedDevices = [];

        productVariants.forEach((variant, variantIndex) => {
          const groupKey = `variant_${variant.id || variantIndex}`;
          const units = Array.isArray(variant.device_units) ? variant.device_units : [];
          const variantImages = Array.isArray(variant.images)
            ? variant.images.map((image) => ({ ...image, url: image.thumbnail_url || image.image_url || image.media_url }))
            : [];

          if (units.length) {
            units.forEach((unit, unitIndex) => {
              loadedDevices.push({
                ...newDevice(null, loadedDevices.length),
                id: variant.id || null,
                variant_id: variant.id || null,
                source_variant_id: variant.id || null,
                device_unit_id: unit.id || null,
                variant_group_key: groupKey,
                client_id: `existing_${variant.id || variantIndex}_unit_${unit.id || unitIndex}`,
                sku_type: 'manual',
                sku: normalizeSku(unit.sku || unit.barcode || variant.sku || variant.barcode || ''),
                status: variant.status || 'active',
                imei_1: unit.imei_1 || '',
                imei_2: unit.imei_2 || '',
                color_name: variant.color_name || unit.color_name || 'Silver',
                region: variant.region || unit.region || 'Global Variant',
                sim_network: variant.sim_network || unit.sim_network || 'Dual Sim',
                model_number: unit.model_number || variant.model_number || '',
                ram: variant.ram || unit.ram || 'Default',
                storage: variant.storage || unit.storage || '256GB',
                battery_health: String(unit.battery_health ?? variant.battery_health ?? 100),
                purchase_price: unit.purchase_cost ?? variant.purchase_price ?? '',
                sale_price: unit.selling_price ?? variant.sale_price ?? '',
                market_price: unit.market_price ?? variant.market_price ?? variant.regular_price ?? '',
                warranty: unit.warranty_type || variant.warranty || 'Shop Warranty 7 Days',
                short_note: unit.note || variant.short_note || '',
                variant_status: variant.status || 'active',
                stock_state: variant.stock_state || 'in_stock',
                minimum_booking_type: variant.minimum_booking_type || product.minimum_booking_type || 'percentage',
                minimum_booking_value: variant.minimum_booking_value || product.minimum_booking_value || '10',
                emi_available: variant.emi_available ?? true,
                allow_preorder: variant.allow_preorder ?? product.allow_preorder ?? true,
                serial_number: variant.serial_number || '',
                activation_status: unit.activation_status || variant.activation_status || variant.device_status || 'inactive',
                box_included: variant.box_included ?? true,
                physical_condition: variant.physical_condition || '',
                condition_grade: variant.condition_grade || '',
                official_warranty: variant.official_warranty || '',
                shop_warranty: variant.shop_warranty || '',
                warranty_duration: variant.warranty_duration || '',
                warranty_notes: variant.warranty_notes || '',
                service_status: unit.service_status || variant.service_status || 'no_service',
                supplier_reference: variant.supplier_reference || '',
                purchase_reference: variant.purchase_reference || '',
                existing_images: variantImages,
                removed_image_ids: [],
                gallery_image_ids: [],
                images: [],
                image_previews: [],
              });
            });
          } else {
            loadedDevices.push({
              ...newDevice(null, loadedDevices.length),
              id: variant.id || null,
              variant_id: variant.id || null,
              source_variant_id: variant.id || null,
              device_unit_id: null,
              variant_group_key: groupKey,
              client_id: `existing_${variant.id || variantIndex}`,
              sku_type: 'manual',
              sku: normalizeSku(variant.sku || variant.barcode || ''),
              status: variant.status || 'active',
              imei_1: variant.imei_1 || '',
              imei_2: variant.imei_2 || '',
              color_name: variant.color_name || 'Silver',
              region: variant.region || 'Global Variant',
              sim_network: variant.sim_network || 'Dual Sim',
              model_number: variant.model_number || '',
              ram: variant.ram || 'Default',
              storage: variant.storage || '256GB',
              battery_health: String(variant.battery_health || 100),
              purchase_price: variant.purchase_price || '',
              sale_price: variant.sale_price || '',
              market_price: variant.market_price || variant.regular_price || '',
              warranty: variant.warranty || 'Shop Warranty 7 Days',
              short_note: variant.short_note || '',
              variant_status: variant.status || 'active',
              stock_state: variant.stock_state || 'in_stock',
              minimum_booking_type: variant.minimum_booking_type || product.minimum_booking_type || 'percentage',
              minimum_booking_value: variant.minimum_booking_value || product.minimum_booking_value || '10',
              emi_available: variant.emi_available ?? true,
              allow_preorder: variant.allow_preorder ?? product.allow_preorder ?? true,
              serial_number: variant.serial_number || '',
              activation_status: variant.activation_status || variant.device_status || 'inactive',
              box_included: variant.box_included ?? true,
              physical_condition: variant.physical_condition || '',
              condition_grade: variant.condition_grade || '',
              official_warranty: variant.official_warranty || '',
              shop_warranty: variant.shop_warranty || '',
              warranty_duration: variant.warranty_duration || '',
              warranty_notes: variant.warranty_notes || '',
              service_status: variant.service_status || 'no_service',
              supplier_reference: variant.supplier_reference || '',
              purchase_reference: variant.purchase_reference || '',
              existing_images: variantImages,
              removed_image_ids: [],
              gallery_image_ids: [],
              images: [],
              image_previews: [],
            });
          }
        });

        setDevices(loadedDevices);
        setRemovedDeviceUnitIds([]);
      }    } catch (err) {
      setError(t('product_form.errors.product_load_failed'));
    } finally {
      setPageLoading(false);
    }
  };

  const updateForm = (field, value, options = {}) => {
    const finalValue = field === 'slug' ? slugify(value) : value;

    if (!options.auto) {
      if (field === 'meta_title') setSeoTouched((previous) => ({ ...previous, title: true }));
      if (field === 'slug') setSeoTouched((previous) => ({ ...previous, slug: true }));
      if (field === 'meta_description') setSeoTouched((previous) => ({ ...previous, description: true }));
      if (field === 'seo_keywords') setSeoTouched((previous) => ({ ...previous, keywords: true }));
    }

    setForm((previous) => ({ ...previous, [field]: finalValue }));
  };

  const generateSeoNow = () => {
    setForm((previous) => ({
      ...previous,
      meta_title: seoSuggestion.title || previous.meta_title,
      slug: seoSuggestion.slug || previous.slug,
      meta_description: seoSuggestion.description || previous.meta_description,
      seo_keywords: seoSuggestion.keywords || previous.seo_keywords,
    }));
    setSeoTouched({ title: true, slug: true, description: true, keywords: true });
  };

  const goNext = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setError('');
    setActiveStep((step) => Math.min(steps.length - 1, step + 1));
  };

  const goPrevious = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setError('');
    setActiveStep((step) => Math.max(0, step - 1));
  };

  const updateDevice = (index, field, value) => {
    setDevices((previous) => previous.map((device, deviceIndex) => {
      if (deviceIndex !== index) return device;
      const next = { ...device, [field]: value };

      if (field === 'activation_status' && ['inactive', 'not_activated', 'boxed'].includes(value)) {
        next.battery_health = '100';
      }

      if (field === 'sku') {
        next.sku = formatSkuInput(value);
      }

      return next;
    }));
  };

  const addCustomOption = (type, index, field, label) => {
    const value = window.prompt(t('product_form.prompt_new_option', { label }));
    if (!value || !value.trim()) return;

    const cleaned = value.trim();
    setVariantOptions((previous) => {
      const current = previous[type] || [];
      const exists = current.some((item) => String(item).toLowerCase() === cleaned.toLowerCase());
      return exists ? previous : { ...previous, [type]: [...current, cleaned] };
    });
    updateDevice(index, field, cleaned);
  };

  const generateSkuForDevice = (index) => {
    setDevices((previous) => previous.map((device, deviceIndex) => (
      deviceIndex === index ? { ...device, sku_type: 'random', sku: makeSku() } : device
    )));
  };

  const cloneDevice = (index, copyImages = false, sameVariant = false) => {
    setDevices((previous) => {
      const source = previous[index] || previous[previous.length - 1];
      const clone = newDevice(source, previous.length);

      // A new physical unit always receives its own identity.
      clone.id = null;
      clone.device_unit_id = null;
      clone.source_variant_id = source.source_variant_id || source.variant_id || source.id || null;
      clone.variant_id = sameVariant ? (source.variant_id || source.id || null) : null;
      clone.variant_group_key = sameVariant
        ? (source.variant_group_key || makeVariantGroupKey())
        : makeVariantGroupKey();
      clone.sku = makeSku();
      clone.imei_1 = '';
      clone.imei_2 = '';
      clone.sku_type = 'random';
      clone.images = copyImages && !sameVariant ? source.images : [];
      clone.image_previews = copyImages && !sameVariant ? source.image_previews : [];
      clone.existing_images = sameVariant ? (source.existing_images || []) : [];
      clone.gallery_image_ids = copyImages && !sameVariant
        ? (source.existing_images || []).map((image) => image.id).filter(Boolean)
        : [];
      clone.removed_image_ids = [];

      const next = [...previous];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const removeDevice = (index) => {
    setDevices((previous) => {
      if (previous.length === 1) return previous;

      const target = previous[index];
      if (target?.device_unit_id) {
        setRemovedDeviceUnitIds((current) => (
          current.includes(Number(target.device_unit_id))
            ? current
            : [...current, Number(target.device_unit_id)]
        ));
      }

      return previous.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const handleDeviceImages = (index, files) => {
    const target = devices[index];
    const remaining = Math.max(0, 5 - ((target?.existing_images || []).length + (target?.images || []).length));
    const selectedFiles = Array.from(files || []).slice(0, remaining);
    const previews = selectedFiles.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }));

    setDevices((previous) => previous.map((device, deviceIndex) => (
      deviceIndex === index ? { ...device, images: [...(device.images || []), ...selectedFiles], image_previews: [...(device.image_previews || []), ...previews] } : device
    )));
  };

  const removeDeviceImage = (deviceIndex, imageIndex, existing = false) => {
    setDevices((previous) => previous.map((device, currentIndex) => {
      if (currentIndex !== deviceIndex) return device;
      if (existing) {
        const image = (device.existing_images || [])[imageIndex];
        return {
          ...device,
          existing_images: (device.existing_images || []).filter((_, index) => index !== imageIndex),
          removed_image_ids: image?.id ? [...(device.removed_image_ids || []), image.id] : (device.removed_image_ids || []),
        };
      }
      return {
        ...device,
        images: device.images.filter((_, index) => index !== imageIndex),
        image_previews: device.image_previews.filter((_, index) => index !== imageIndex),
      };
    }));
  };

  const handleVideo = (file) => {
    setProductVideo(file || null);
    setProductVideoPreview(file ? URL.createObjectURL(file) : '');
  };

  const addListItem = (field, emptyItem) => {
    setForm((previous) => ({ ...previous, [field]: [...(previous[field] || []), emptyItem] }));
  };

  const updateListItem = (field, index, key, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: (previous[field] || []).map((item, itemIndex) => (
        itemIndex === index
          ? (typeof item === 'string' ? value : { ...item, [key]: value })
          : item
      )),
    }));
  };

  const removeListItem = (field, index) => {
    setForm((previous) => ({
      ...previous,
      [field]: (previous[field] || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const validateBeforeSubmit = () => {
    if (!form.brand_id) return t('product_form.validation.select_brand');
    if (!form.category_id) return t('product_form.validation.select_category');
    if (!form.name.trim()) return t('product_form.validation.enter_name');
    if (!devices.length) return t('product_form.validation.need_device');

    const seenSku = new Map();
    const seenImei1 = new Map();
    const seenImei2 = new Map();

    for (let index = 0; index < devices.length; index += 1) {
      const device = devices[index];
      const label = t('product_form.device_label', { number: index + 1 });
      const sku = normalizeSku(device.sku);
      const imei1 = String(device.imei_1 || '').trim();
      const imei2 = String(device.imei_2 || '').trim();

      if (!device.sku) return t('product_form.validation.sku_required', { label });
      if (!isValidNstSku(device.sku)) return t('product_form.validation.sku_format', { label });
      if (!device.sale_price) return t('product_form.validation.sale_price_required', { label });
      const activeExistingImages = (device.existing_images || []).filter((image) => !(device.removed_image_ids || []).includes(image.id));
      if (activeExistingImages.length + device.images.length > 5) return t('product_form.validation.max_images', { label });

      if (seenSku.has(sku)) return t('product_form.validation.sku_duplicate', { label, other: seenSku.get(sku) + 1 });
      seenSku.set(sku, index);

      if (imei1) {
        if (seenImei1.has(imei1) || seenImei2.has(imei1)) {
          return t('product_form.validation.imei1_duplicate', { label });
        }
        seenImei1.set(imei1, index);
      }

      if (imei2) {
        if (seenImei1.has(imei2) || seenImei2.has(imei2)) {
          return t('product_form.validation.imei2_duplicate', { label });
        }
        seenImei2.set(imei2, index);
      }
    }

    return '';
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validateBeforeSubmit();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      const selectedBrandName = brands.find((brand) => String(brand.id) === String(form.brand_id))?.name || '';
      const selectedCategoryName = categories.find((category) => String(category.id) === String(form.category_id))?.name || '';

      const normalizedDevices = devices.map((device, index) => {
        const sku = normalizeSku(device.sku);
        const ram = device.ram || 'Default';
        const activationStatus = device.activation_status || 'inactive';
        const batteryHealth = ['inactive', 'not_activated', 'boxed'].includes(activationStatus) ? '100' : (device.battery_health || '100');
        const parts = [device.color_name, device.region, device.sim_network, ram !== 'Default' ? ram : '', device.storage]
          .filter(Boolean)
          .join(' / ');

        return {
          id: device.variant_id || device.id || undefined,
          variant_id: device.variant_id || device.id || undefined,
          source_variant_id: device.source_variant_id || device.variant_id || device.id || undefined,
          device_unit_id: device.device_unit_id || undefined,
          variant_group_key: device.variant_group_key || `row_${index}`,
          client_index: index,
          variant_name: parts || 'Standard',
          condition: form.condition || 'new',
          sku,
          barcode: sku,
          model_number: device.model_number || '',
          barcode_mode: 'manual',
          status: device.variant_status || 'active',
          variant_status: device.variant_status || 'active',
          device_status: ['active', 'activated', 'open_box'].includes(device.activation_status) ? 'active' : 'inactive',
          activation_status: activationStatus,
          imei_1: device.imei_1,
          imei_2: device.imei_2,
          color_name: device.color_name,
          region: device.region,
          sim_network: device.sim_network,
          ram,
          storage: device.storage,
          battery_health: batteryHealth,
          purchase_price: device.purchase_price || 0,
          sale_price: device.sale_price || 0,
          regular_price: device.market_price || device.sale_price || 0,
          market_price: device.market_price || device.sale_price || 0,
          warranty: device.warranty,
          short_note: device.short_note,
          stock_quantity: 1,
          opening_stock_quantity: 1,
          imei_tracking: 1,
          branch_id: form.branch_id,
          supplier_id: form.supplier_id,
          minimum_booking_type: device.minimum_booking_type || form.minimum_booking_type,
          minimum_booking_value: device.minimum_booking_value || form.minimum_booking_value,
          emi_available: device.emi_available,
          allow_preorder: device.allow_preorder,
          stock_state: device.stock_state,
          serial_number: device.serial_number,
          box_included: device.box_included,
          physical_condition: device.physical_condition,
          condition_grade: device.condition_grade,
          official_warranty: device.official_warranty,
          shop_warranty: device.shop_warranty,
          warranty_duration: device.warranty_duration,
          warranty_notes: device.warranty_notes,
          service_status: device.service_status,
          supplier_reference: device.supplier_reference,
          purchase_reference: device.purchase_reference,
        };
      });

      const firstDevice = normalizedDevices[0] || {};

      formData.append('name', form.name.trim());
      formData.append('brand_id', form.brand_id || '');
      formData.append('category_id', form.category_id || '');
      formData.append('supplier_id', form.supplier_id || '');
      formData.append('brand', selectedBrandName);
      formData.append('category', selectedCategoryName);
      formData.append('model', form.name.trim());
      formData.append('condition', form.condition || 'new');
      formData.append('status', form.product_status || 'draft');
      formData.append('website_published', form.website_published ? '1' : '0');
      formData.append('draft_step', String(activeStep + 1));
      formData.append('allow_preorder', form.allow_preorder ? '1' : '0');
      formData.append('activation_status', form.activation_status || 'inactive');
      formData.append('box_included', form.box_included ? '1' : '0');
      formData.append('physical_condition', form.physical_condition || '');
      formData.append('condition_grade', form.condition_grade || '');
      formData.append('official_warranty', form.official_warranty || '');
      formData.append('shop_warranty', form.shop_warranty || '');
      formData.append('warranty_notes', form.warranty_notes || '');
      formData.append('whats_in_box', form.whats_in_box || '');
      formData.append('sku', '');
      formData.append('barcode', '');
      formData.append('barcode_mode', 'auto');
      formData.append('purchase_price', firstDevice.purchase_price || 0);
      formData.append('sale_price', firstDevice.sale_price || 0);
      formData.append('regular_price', firstDevice.market_price || firstDevice.sale_price || 0);
      formData.append('discount_price', '');
      formData.append('stock_quantity', String(normalizedDevices.length));
      formData.append('low_stock_alert', '5');
      formData.append('warranty', firstDevice.warranty || '');
      formData.append('minimum_booking_type', form.minimum_booking_type);
      formData.append('minimum_booking_value', form.minimum_booking_value || '');
      formData.append('minimum_booking_amount', form.booking_amount || '');
      formData.append('short_description', form.short_description || '');
      formData.append('description', form.description || '');
      formData.append('meta_title', form.meta_title || `${selectedBrandName} ${form.name}`.trim());
      formData.append('meta_description', form.meta_description || form.short_description || '');
      formData.append('seo_keywords', form.seo_keywords || '');
      formData.append('key_features', JSON.stringify((form.key_features || []).filter(Boolean)));
      formData.append('faqs', JSON.stringify((form.faqs || []).filter((item) => item.question || item.answer)));
      formData.append('specifications', JSON.stringify((form.specifications || []).filter((item) => item.name || item.value)));
      formData.append('add_ons', JSON.stringify((form.add_ons || []).filter((item) => item.name)));
      formData.append('page_options', JSON.stringify({
        branch_id: form.branch_id,
        emi_possible: form.emi_possible,
        youtube_video_url: form.youtube_video_url,
        video_watermark: form.video_watermark,
        website_published: form.website_published,
        allow_preorder: form.allow_preorder,
        show_price_at_zero_stock: true,
        show_branch: form.show_branch !== false,
        used_notes: form.used_notes || '',
        product_entry_rule: form.condition === 'new' ? 'new_and_supplier_new_only' : 'used_purchase_ready_sale',
      }));
      formData.append('variants', JSON.stringify(normalizedDevices));
      formData.append('removed_device_unit_ids', JSON.stringify(removedDeviceUnitIds));

      devices.forEach((device, index) => {
        (device.images || []).forEach((file) => {
          formData.append(`variant_images_${index}[]`, file);
        });
        formData.append(`variant_remove_image_ids_${index}`, JSON.stringify(device.removed_image_ids || []));
        formData.append(`variant_gallery_image_ids_${index}`, JSON.stringify(device.gallery_image_ids || []));
      });

      if (productVideo) {
        formData.append('product_video', productVideo);
      }

      const response = isEditMode
        ? await productService.updateProduct(id, formData)
        : await productService.createProduct(formData);

      setSuccess(response?.message || t('product_form.messages.saved'));
      productDraftService.complete(draftKey).catch(() => {});
      window.localStorage.removeItem('nst_product_partial_draft');
      window.localStorage.removeItem('nst_product_full_draft');
      setTimeout(() => navigate('/products'), 700);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || t('product_form.errors.save_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };


  const buildDraftPayload = () => ({
    form,
    devices: devices.map((device) => ({
      ...device,
      images: [],
      image_previews: [],
    })),
    activeStep,
    saved_at: new Date().toISOString(),
  });

  const saveStepDraft = async () => {
    try {
      setError('');
      const payload = buildDraftPayload();
      await productDraftService.save({
        draft_key: draftKey,
        product_id: isEditMode ? Number(id) : null,
        current_step: activeStep + 1,
        payload,
        status: 'active',
      });
      window.localStorage.setItem('nst_product_partial_draft', JSON.stringify(payload));
      setSuccess(t('product_form.messages.step_saved', { step: activeStep + 1 }));
      window.setTimeout(() => setSuccess(''), 2200);
    } catch (err) {
      setError(err?.response?.data?.message || t('product_form.errors.partial_draft_failed'));
    }
  };

  const saveAsDraft = async () => {
    try {
      setError('');
      const payload = { ...buildDraftPayload(), draft_type: 'full_product_draft' };
      await productDraftService.save({
        draft_key: draftKey,
        product_id: isEditMode ? Number(id) : null,
        current_step: activeStep + 1,
        payload,
        status: 'active',
      });
      window.localStorage.setItem('nst_product_full_draft', JSON.stringify(payload));
      setSuccess(t('product_form.messages.draft_saved'));
      window.setTimeout(() => setSuccess(''), 2400);
    } catch (err) {
      setError(err?.response?.data?.message || t('product_form.errors.draft_save_failed'));
    }
  };

  const renderStep = () => {
    if (activeStep === 0) {
      return (
        <BasicStep
          form={form}
          updateForm={updateForm}
          brands={brands}
          categories={categories}
          branches={branches}
          suppliers={suppliers}
          reloadOptions={loadOptions}
          isUsedCatalogProduct={['used', 'pre_owned', 'refurbished'].includes(String(form.condition || '').toLowerCase())}
        />
      );
    }

    if (activeStep === 1) {
      return (
        <SimpleProductVariantsStep
          form={form}
          updateForm={updateForm}
          devices={devices}
          updateDevice={updateDevice}
          cloneDevice={cloneDevice}
          removeDevice={removeDevice}
          generateSkuForDevice={generateSkuForDevice}
          handleDeviceImages={handleDeviceImages}
          removeDeviceImage={removeDeviceImage}
          isApple={isApple}
          variantOptions={variantOptions}
          addCustomOption={addCustomOption}
        />
      );
    }

    if (activeStep === 2) {
      return (
        <OtherDetailsStep
          productId={isEditMode ? Number(id) : null}
          form={form}
          updateForm={updateForm}
          productVideo={productVideo}
          productVideoPreview={productVideoPreview}
          handleVideo={handleVideo}
          generateSeoNow={generateSeoNow}
          seoSuggestion={seoSuggestion}
          updateListItem={updateListItem}
          addListItem={addListItem}
          removeListItem={removeListItem}
        />
      );
    }

    return <FinalReviewStep form={form} devices={devices} />;
  };

  const stepProgress = Math.round(((activeStep + 1) / steps.length) * 100);

  const currentStep = steps[activeStep];
  const firstDevicePreview = devices[0] || {};
  const previewImages = [
    ...(firstDevicePreview.existing_images || []).filter((image) => !(firstDevicePreview.removed_image_ids || []).includes(image.id)).map((image, sourceIndex) => ({ ...image, sourceIndex, isExisting: true, previewUrl: image.url || image.thumbnail_url || image.image_url || image.media_url })),
    ...(firstDevicePreview.image_previews || []).map((image, sourceIndex) => ({ ...image, sourceIndex, isExisting: false, previewUrl: image.url })),
  ].slice(0, 5);
  const isUsedCatalogProduct = ['used', 'pre_owned', 'refurbished'].includes(String(form.condition || '').toLowerCase());

  if (pageLoading) {
    return <div className="nst-product-shell">{t('product_form.loading_product')}</div>;
  }

  return (
    <div className="nst-product-shell reference-ui-shell">
      <style>{styles}</style>

      {error && <div className="alert danger">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <form id="nst-product-entry-form" onSubmit={submit} className="product-reference-form" onKeyDown={(event) => { if (event.key === 'Enter' && event.target?.tagName !== 'TEXTAREA') event.preventDefault(); }}>
        <header className="reference-page-header">
          <NstPageHeader icon={NstHdrPackageCheck} title={isEditMode ? (isUsedCatalogProduct ? t('product_form.title_edit_used') : t('product_form.title_edit_new')) : t('product_form.title_add')} subtitle={isUsedCatalogProduct ? t('product_form.subtitle_used') : t('product_form.subtitle_new')}><span>{t('product_form.draft')}</span></NstPageHeader>
          <div className="reference-header-actions">
            <button type="button" className="reference-cancel" onClick={() => navigate('/products')}>{t('common.cancel')}</button>
            <button type="button" className="reference-draft" onClick={saveAsDraft}>{t('product_form.save_draft')}</button>
            <button type="submit" className="reference-save" disabled={loading}>{loading ? t('product_form.saving') : t('product_form.save_product')}</button>
          </div>
        </header>

        <div className="reference-stepper" role="tablist" aria-label={t('product_form.stepper_aria')}>
          {steps.map((step, index) => (
            <button key={step.key} type="button" onClick={() => setActiveStep(index)} className={`reference-step ${activeStep === index ? 'active' : ''} ${activeStep > index ? 'done' : ''}`}>
              <span>{activeStep > index ? '✓' : index + 1}</span>
              <strong>{t(`product_form.steps.${step.key}.title`)}</strong>
            </button>
          ))}
        </div>

        <div className="reference-content-grid">
          <main className="reference-main-card">
            <div className="reference-section-heading">
              <div><h2>{t(`product_form.steps.${currentStep.key}.title`)}</h2><p>{t(`product_form.steps.${currentStep.key}.summary`)}</p></div>
              <span>{t('product_form.step_of', { step: activeStep + 1, total: steps.length })}</span>
            </div>

            {isUsedCatalogProduct && <div className="used-edit-banner">{t('product_form.used_edit_banner')}</div>}
            {activeStep === 1 && <div className="price-view-rule-note">ⓘ {t('product_form.price_rule_note')}</div>}
            {renderStep()}
          </main>

          <aside className="reference-sidebar">
            <section className="reference-side-card">
              <div className="reference-side-title"><h3>{t('product_form.labels.images')}</h3><span>{t('product_form.sidebar.images_count', { count: previewImages.length })}</span></div>
              <p className="sidebar-helper-copy">{t('product_form.sidebar.images_help')}</p>
              {previewImages.length > 0 ? <div className="reference-image-grid">{previewImages.map((image, index) => <div key={image.id || image.name || index}><img src={image.previewUrl} alt={image.original_name || image.name || t('product_form.sidebar.image_alt', { number: index + 1 })} /></div>)}</div> : <div className="sidebar-empty-preview">{t('product_form.sidebar.no_image')}</div>}
            </section>

            <section className="reference-side-card">
              <h3>{t('product_form.sidebar.preview')}</h3>
              <div className="reference-preview">
                <div className="reference-preview-visual">{previewImages[0]?.previewUrl ? <img src={previewImages[0].previewUrl} alt={form.name || t('product_form.sidebar.product_alt')} /> : <span>▯</span>}</div>
                <dl>
                  <div><dt>{t('product_form.labels.product_name')}</dt><dd>{form.name || '—'}</dd></div>
                  <div><dt>SKU</dt><dd>{firstDevicePreview.sku || '—'}</dd></div>
                  <div><dt>{t('product_form.labels.category')}</dt><dd>{selectedCategory?.name || '—'}</dd></div>
                  <div><dt>{t('product_form.labels.brand')}</dt><dd>{selectedBrand?.name || '—'}</dd></div>
                  <div><dt>{t('product_form.labels.sale_price')}</dt><dd>{firstDevicePreview.sale_price ? `৳${numberFormat(firstDevicePreview.sale_price)}` : '—'}</dd></div>
                  <div><dt>{t('product_form.labels.stock')}</dt><dd>{devices.length || '—'}</dd></div>
                  <div><dt>{t('product_form.labels.status')}</dt><dd><span className="reference-status">{t(`product_form.status.${form.product_status || 'active'}`, { defaultValue: form.product_status || 'active' })}</span></dd></div>
                </dl>
              </div>
            </section>

            <section className="reference-side-card reference-tips">
              <h3>{t('product_form.tips.title')}</h3>
              <p>✓ {t('product_form.tips.imei')}</p>
              <p>✓ {t('product_form.tips.images')}</p>
              <p>✓ {t('product_form.tips.sku')}</p>
              <p>✓ {t('product_form.tips.publish')}</p>
            </section>
          </aside>
        </div>

        <footer className="reference-footer-actions">
          <button type="button" className="ghost-btn" onClick={saveStepDraft}>{t('product_form.save_step')}</button>
          <button type="button" className="ghost-btn" disabled={activeStep === 0} onClick={goPrevious}>← {t('product_form.previous')}</button>
          <div className="action-spacer" />
          {activeStep < steps.length - 1 ? <button type="button" className="primary-btn" onClick={goNext}>{t('product_form.next_step')} →</button> : <button type="submit" className="reference-save" disabled={loading}>{loading ? t('product_form.saving') : t('product_form.review_save_product')}</button>}
        </footer>
      </form>
    </div>
  );
}

function BasicStep({ form, updateForm, brands, categories, branches, suppliers, reloadOptions, isUsedCatalogProduct }) {
  const quickAddSupplier = async () => {
    const name = window.prompt(t('product_form.prompt_supplier_name'));
    if (!name) return;

    try {
      await supplierService.createSupplier({ name, company_name: name, status: 'active' });
      await reloadOptions();
    } catch (err) {
      window.alert(t('product_form.errors.supplier_create_failed'));
    }
  };

  return (
    <div className="grid two">
      {isUsedCatalogProduct ? <UsedProductHelper form={form} updateForm={updateForm} /> : null}
      <Select label={t('product_form.labels.brand')} value={form.brand_id} onChange={(value) => updateForm('brand_id', value)} required>
        <option value="">{t('product_form.options.select_brand')}</option>
        {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </Select>

      <Select label={t('product_form.labels.category')} value={form.category_id} onChange={(value) => updateForm('category_id', value)} required>
        <option value="">{t('product_form.options.select_category')}</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </Select>

      <Select label={t('product_form.labels.branch_optional')} value={form.branch_id} onChange={(value) => updateForm('branch_id', value)}>
        <option value="">{t('product_form.options.prime_stock')}</option>
        {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </Select>

      <Field label={t('product_form.labels.device_name')} value={form.name} onChange={(value) => updateForm('name', value)} required placeholder="iPhone 17 Pro Max" />

      <div className="field-row with-button">
        <Select label={t('product_form.labels.supplier')} value={form.supplier_id} onChange={(value) => updateForm('supplier_id', value)}>
          <option value="">{t('product_form.options.select_supplier')}</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name || supplier.company_name}</option>)}
        </Select>
        <button type="button" className="soft-btn" onClick={quickAddSupplier}>+ {t('product_form.buttons.quick_add')}</button>
      </div>

      <Select label={t('product_form.labels.product_type')} value={isUsedCatalogProduct ? form.condition : 'new'} onChange={() => updateForm('condition', isUsedCatalogProduct ? form.condition : 'new')}>
        {isUsedCatalogProduct ? (
          <option value={form.condition}>{form.condition === 'pre_owned' ? t('product_form.options.type_pre_owned') : form.condition === 'refurbished' ? t('product_form.options.type_refurbished') : t('product_form.options.type_used')}</option>
        ) : (
          <option value="new">{t('product_form.options.type_new')}</option>
        )}
      </Select>

      <Select label={t('product_form.labels.product_status')} value={form.product_status} onChange={(value) => updateForm('product_status', value)}>
        <option value="draft">{t('product_form.status.draft')}</option>
        <option value="active">{t('product_form.status.active')}</option>
        <option value="inactive">{t('product_form.status.inactive')}</option>
      </Select>

      <Select label={t('product_form.labels.website_publish')} value={form.website_published ? 'yes' : 'no'} onChange={(value) => updateForm('website_published', value === 'yes')}>
        <option value="no">{t('product_form.options.keep_unpublished')}</option>
        <option value="yes">{t('product_form.options.publish_website')}</option>
      </Select>

      <div className="span-2">
        <Textarea label={t('product_form.labels.short_notes')} value={form.short_description} onChange={(value) => updateForm('short_description', value)} placeholder={t('product_form.placeholders.short_notes')} />
      </div>
    </div>
  );
}



/* ------------------------------------------------------------------
   Used / Pre-Owned helper
   1) Copy the details already written for a NEW product (no retyping)
   2) Used Notes: condition information shown to customers on the website
   ------------------------------------------------------------------ */
function UsedProductHelper({ form, updateForm }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const search = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await productService.getProducts({ search: query, condition: 'new', per_page: 20 });
      const rows = response?.data?.data || response?.data || response || [];
      const list = (Array.isArray(rows) ? rows : []).filter((row) => String(row.condition || 'new').toLowerCase() === 'new');
      setResults(list);
      if (!list.length) setMessage(t('product_form.used.no_result'));
    } catch (error) {
      setMessage(error?.response?.data?.message || t('product_form.used.search_failed'));
    } finally { setBusy(false); }
  };

  const copyFrom = async (row) => {
    if (!window.confirm(t('product_form.used.copy_confirm', { name: row.name }))) return;
    setBusy(true); setMessage('');
    try {
      const response = await productService.getProduct(row.id);
      const p = response?.data || response;
      if (!p) throw new Error(t('product_form.used.not_found'));
      if (p.brand_id && !form.brand_id) updateForm('brand_id', p.brand_id);
      if (p.category_id && !form.category_id) updateForm('category_id', p.category_id);
      if (!form.name) updateForm('name', p.name || '');
      updateForm('short_description', p.short_description || '');
      updateForm('description', p.description || '');
      if (Array.isArray(p.key_features) && p.key_features.length) updateForm('key_features', p.key_features);
      if (Array.isArray(p.specifications) && p.specifications.length) updateForm('specifications', p.specifications);
      if (Array.isArray(p.faqs) && p.faqs.length) updateForm('faqs', p.faqs);
      if (p.whats_in_box) updateForm('whats_in_box', p.whats_in_box);
      setMessage(t('product_form.used.copied', { name: p.name }));
      setResults([]);
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || t('product_form.used.copy_failed'));
    } finally { setBusy(false); }
  };

  return (
    <div className="span-2" style={{ display: 'grid', gap: 12, padding: 16, border: '1px solid var(--nst-dashboard-border)', borderRadius: 8, background: 'var(--nst-dashboard-surface)' }}>
      <div>
        <strong style={{ fontSize: 15 }}>{t('product_form.used.title')}</strong>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--nst-dashboard-muted)' }}>{t('product_form.used_copy_help')}</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search(); } }} placeholder={t('product_form.used.search_placeholder')} style={{ flex: 1 }} />
        <button type="button" className="nst-btn nst-btn--primary" onClick={search} disabled={busy}>{busy ? t('product_form.buttons.searching') : t('common.search')}</button>
      </div>
      {results.length ? (
        <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {results.map((row) => (
            <div key={row.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', border: '1px solid var(--nst-dashboard-border)', borderRadius: 8 }}>
              <span style={{ minWidth: 0 }}><b>{row.name}</b><small style={{ display: 'block', color: 'var(--nst-dashboard-muted)' }}>{[row.brand?.name || row.brand, row.model, row.sku].filter(Boolean).join(' · ')}</small></span>
              <button type="button" className="nst-btn nst-btn--secondary nst-btn--sm" onClick={() => copyFrom(row)} disabled={busy}>{t('product_form.buttons.copy')}</button>
            </div>
          ))}
        </div>
      ) : null}
      {message ? <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{message}</p> : null}
      <Textarea label={t('product_form.used.notes_label')} value={form.used_notes} onChange={(value) => updateForm('used_notes', value)} placeholder={t('product_form.used.notes_placeholder')} />
    </div>
  );
}

function PricingBookingStep({ form, updateForm }) {
  return (
    <div className="simple-sales-rules">
      <div className="simple-block-title">
        <div><h3>{t('product_form.sales_rules.title')}</h3><p>{t('product_form.sales_rules.help')}</p></div>
      </div>
      <div className="grid four compact-rule-grid">
        <Select label={t('product_form.labels.minimum_booking')} value={form.minimum_booking_type} onChange={(value) => updateForm('minimum_booking_type', value)}>
          <option value="percentage">{t('product_form.options.percentage')}</option>
          <option value="fixed">{t('product_form.options.fixed_amount')}</option>
        </Select>
        <Field label={t('product_form.labels.booking_value')} value={form.minimum_booking_value} onChange={(value) => updateForm('minimum_booking_value', value)} placeholder="10" help={t('product_form.help.booking_min')} />
        <Select label="EMI" value={form.emi_possible} onChange={(value) => updateForm('emi_possible', value)}>
          <option value="yes">{t('product_form.options.available')}</option>
          <option value="no">{t('product_form.options.not_available')}</option>
        </Select>
        <Select label={t('product_form.labels.preorder')} value={form.allow_preorder ? 'yes' : 'no'} onChange={(value) => updateForm('allow_preorder', value === 'yes')}>
          <option value="yes">{t('product_form.options.available')}</option>
          <option value="no">{t('product_form.options.not_available')}</option>
        </Select>
        <Select label={t('product_form.labels.show_branch')} value={form.show_branch === false ? 'no' : 'yes'} onChange={(value) => updateForm('show_branch', value === 'yes')} help={t('product_form.help.show_branch')}>
          <option value="yes">{t('product_form.options.show_branch_yes')}</option>
          <option value="no">{t('product_form.options.show_branch_no')}</option>
        </Select>
      </div>
    </div>
  );
}

function SimpleProductVariantsStep({ form, updateForm, devices, updateDevice, cloneDevice, removeDevice, generateSkuForDevice, handleDeviceImages, removeDeviceImage, isApple, variantOptions, addCustomOption }) {
  const groupKeys = [...new Set(devices.map((device) => device.variant_group_key || device.client_id))];

  return (
    <div className="simple-variant-entry">
      <PricingBookingStep form={form} updateForm={updateForm} />

      <div className="simple-block-title">
        <div>
          <h3>{t('product_form.variants.title')}</h3>
          <p>{t('product_form.variants.help')}</p>
        </div>
        <span>{t(groupKeys.length === 1 ? 'product_form.variants.variant_count_one' : 'product_form.variants.variant_count', { count: groupKeys.length })} · {t(devices.length === 1 ? 'product_form.variants.unit_count_one' : 'product_form.variants.unit_count', { count: devices.length })}</span>
      </div>

      <div className="simple-variant-list">
        {devices.map((device, index) => {
          const groupKey = device.variant_group_key || device.client_id;
          const groupUnits = devices.filter((row) => (row.variant_group_key || row.client_id) === groupKey);
          const groupPosition = devices
            .slice(0, index + 1)
            .filter((row) => (row.variant_group_key || row.client_id) === groupKey).length;
          const variantNumber = groupKeys.indexOf(groupKey) + 1;
          const isGroupPrimary = groupPosition === 1;
          const groupPrimary = groupUnits[0] || device;
          const savedImages = (groupPrimary.existing_images || []).filter((image) => !(groupPrimary.removed_image_ids || []).includes(image.id));
          const imageCount = savedImages.length + (groupPrimary.images || []).length;

          return (
            <section key={device.client_id} className="simple-variant-card">
              <header>
                <div>
                  <b>{t('product_form.variants.card_title', { variant: variantNumber, unit: groupPosition, total: groupUnits.length })}</b>
                  <small>{groupPrimary.color_name} / {groupPrimary.region} / {groupPrimary.storage} / {groupPrimary.sim_network}</small>
                </div>
                <div className="device-actions">
                  {isGroupPrimary && (
                    <>
                      <button type="button" className="soft-btn" onClick={() => cloneDevice(index, false, true)}>+ {t('product_form.buttons.same_variant_unit')}</button>
                      <button type="button" className="soft-btn" onClick={() => cloneDevice(index, false, false)}>{t('product_form.buttons.clone_new_variant')}</button>
                    </>
                  )}
                  <button type="button" className="danger-btn" onClick={() => removeDevice(index)} disabled={devices.length === 1}>
                    {groupUnits.length > 1 ? t('product_form.buttons.remove_unit') : t('product_form.buttons.remove_variant')}
                  </button>
                </div>
              </header>

              {isGroupPrimary ? (
                <div className="simple-variant-section">
                  <h4>{t('product_form.variants.configuration')}</h4>
                  <div className="grid five">
                    <CustomOptionSelect label={t('product_form.labels.color')} value={device.color_name} onChange={(value) => updateDevice(index, 'color_name', value)} options={variantOptions.color} addLabel={t('product_form.buttons.add_color')} onAdd={() => addCustomOption('color', index, 'color_name', t('product_form.custom.color'))} />
                    <CustomOptionSelect label={t('product_form.labels.region_variant')} value={device.region} onChange={(value) => updateDevice(index, 'region', value)} options={variantOptions.region} addLabel={t('product_form.buttons.add_variant')} onAdd={() => addCustomOption('region', index, 'region', t('product_form.custom.region'))} />
                    <CustomOptionSelect label={t('product_form.labels.storage')} value={device.storage} onChange={(value) => updateDevice(index, 'storage', value)} options={variantOptions.storage} addLabel={t('product_form.buttons.add_storage')} onAdd={() => addCustomOption('storage', index, 'storage', t('product_form.custom.storage'))} />
                    <CustomOptionSelect label={t('product_form.labels.sim_network')} value={device.sim_network} onChange={(value) => updateDevice(index, 'sim_network', value)} options={variantOptions.sim} addLabel={t('product_form.buttons.add_sim')} onAdd={() => addCustomOption('sim', index, 'sim_network', t('product_form.custom.sim'))} />
                    <CustomOptionSelect label="RAM" value={device.ram} onChange={(value) => updateDevice(index, 'ram', value)} options={variantOptions.ram} addLabel={t('product_form.buttons.add_ram')} onAdd={() => addCustomOption('ram', index, 'ram', t('product_form.custom.ram'))} help={isApple || device.ram === 'Default' ? t('product_form.help.ram_default') : ''} />
                  </div>
                </div>
              ) : (
                <div className="simple-variant-section">
                  <h4>{t('product_form.variants.same_configuration')}</h4>
                  <p className="simple-spec-note">
                    {t('product_form.variants.shares_note', { variant: variantNumber, config: `${groupPrimary.color_name} / ${groupPrimary.region} / ${groupPrimary.storage} / ${groupPrimary.sim_network}${groupPrimary.ram && groupPrimary.ram !== 'Default' ? ` / ${groupPrimary.ram}` : ''}` })}
                  </p>
                </div>
              )}

              <div className="simple-variant-section">
                <h4>{t('product_form.variants.unit_price')}</h4>
                <div className="grid three">
                  <Field label={t('product_form.labels.purchase_price')} value={device.purchase_price} onChange={(value) => updateDevice(index, 'purchase_price', value)} placeholder={t('product_form.placeholders.purchase_price')} />
                  <Field label={t('product_form.labels.sale_price')} value={device.sale_price} onChange={(value) => updateDevice(index, 'sale_price', value)} required placeholder={t('product_form.placeholders.sale_price')} />
                  <Field label={t('product_form.labels.market_price')} value={device.market_price} onChange={(value) => updateDevice(index, 'market_price', value)} placeholder={t('common.optional')} />
                </div>
              </div>

              <details className="simple-variant-details" open={groupUnits.length > 1}>
                <summary>{t('product_form.variants.details_summary')}</summary>
                <div className="grid four simple-detail-grid">
                  <Select label={t('product_form.labels.sku_type')} value={device.sku_type} onChange={(value) => updateDevice(index, 'sku_type', value)}>
                    <option value="random">{t('product_form.options.random_nst')}</option>
                    <option value="manual">{t('product_form.options.manual_nst')}</option>
                  </Select>
                  <Field label={t('product_form.labels.sku_barcode')} value={device.sku} onChange={(value) => updateDevice(index, 'sku', value)} required placeholder="NST-123456789" />
                  <button type="button" className="generate-btn simple-generate" onClick={() => generateSkuForDevice(index)}>{t('product_form.buttons.generate_sku')}</button>
                  <Field label={t('product_form.labels.model_number')} value={device.model_number} onChange={(value) => updateDevice(index, 'model_number', value)} placeholder={t('common.optional')} />
                  <Field label="IMEI 1" value={device.imei_1} onChange={(value) => updateDevice(index, 'imei_1', value)} />
                  <Field label="IMEI 2" value={device.imei_2} onChange={(value) => updateDevice(index, 'imei_2', value)} />
                  <Select label={t('product_form.labels.activation_status')} value={device.activation_status} onChange={(value) => updateDevice(index, 'activation_status', value)}>
                    {variantOptions.status.map((item) => <option key={item.value} value={item.value}>{t(`product_form.activation.${item.value}`, { defaultValue: item.label })}</option>)}
                  </Select>
                  <CustomOptionSelect label={t('product_form.labels.warranty')} value={device.warranty} onChange={(value) => updateDevice(index, 'warranty', value)} options={variantOptions.warranty} addLabel={t('product_form.buttons.add_warranty')} onAdd={() => addCustomOption('warranty', index, 'warranty', t('product_form.custom.warranty'))} />
                  <Select label={t('product_form.labels.box_included')} value={device.box_included ? 'yes' : 'no'} onChange={(value) => updateDevice(index, 'box_included', value === 'yes')}>
                    <option value="yes">{t('common.yes')}</option>
                    <option value="no">{t('common.no')}</option>
                  </Select>
                  <Field label={t('product_form.labels.battery_health')} value={['inactive', 'not_activated', 'boxed'].includes(device.activation_status) ? '100' : device.battery_health} onChange={(value) => updateDevice(index, 'battery_health', value)} readOnly={['inactive', 'not_activated', 'boxed'].includes(device.activation_status)} />
                  <div className="span-2"><Textarea label={t('product_form.labels.short_note')} value={device.short_note} onChange={(value) => updateDevice(index, 'short_note', value)} placeholder={t('product_form.placeholders.unit_note')} /></div>
                </div>
              </details>

              {isGroupPrimary ? (
                <details className="simple-variant-details" open={imageCount === 0}>
                  <summary>{t('product_form.images.shared_title')} <span>{imageCount}/5</span></summary>
                  <div className="simple-image-entry">
                    <label className="reference-upload-zone compact-upload-zone">
                      <span className="upload-cloud">☁</span>
                      <strong>{t('product_form.images.add_for_variant')}</strong>
                      <small>{t('product_form.images.shared_help')}</small>
                      <input type="file" accept="image/*" multiple onChange={(event) => handleDeviceImages(index, event.target.files)} />
                    </label>
                    <div className="image-grid">
                      {savedImages.map((image, imageIndex) => (
                        <div className="image-item" key={`existing_${image.id || imageIndex}`}>
                          <img src={image.url || image.thumbnail_url || image.image_url || image.media_url} alt={image.original_name || t('product_form.images.saved_alt')} />
                          <p>{image.original_name || t('product_form.images.saved_name', { number: imageIndex + 1 })}</p>
                          <button type="button" onClick={() => removeDeviceImage(index, (groupPrimary.existing_images || []).findIndex((row) => row === image), true)}>{t('product_form.buttons.unlink')}</button>
                        </div>
                      ))}
                      {(groupPrimary.image_previews || []).map((image, imageIndex) => (
                        <div className="image-item" key={`${image.name}_${imageIndex}`}>
                          <img src={image.url} alt={image.name} />
                          <p>{image.name}</p>
                          <button type="button" onClick={() => removeDeviceImage(index, imageIndex)}>{t('product_form.buttons.remove')}</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              ) : (
                <div className="simple-variant-section">
                  <h4>{t('product_form.labels.images')}</h4>
                  <p className="simple-spec-note">{t('product_form.images.unit_uses_shared', { variant: variantNumber })}</p>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="device-actions">
        <button type="button" className="primary-outline simple-add-variant" onClick={() => setTimeout(() => cloneDevice(devices.length - 1, false, true), 0)}>
          + {t('product_form.buttons.add_more_units')}
        </button>
        <button type="button" className="primary-outline simple-add-variant" onClick={() => setTimeout(() => cloneDevice(devices.length - 1, false, false), 0)}>
          + {t('product_form.buttons.add_different_variant')}
        </button>
      </div>
    </div>
  );
}
function VariantOptionsStep({ devices, updateDevice, cloneDevice, removeDevice, isApple, variantOptions, addCustomOption }) {
  return (
    <div className="device-list compact-device-list">
      {devices.map((device, index) => (
        <div key={device.client_id} className="device-card harmony-card">
          <div className="device-card-head">
            <div>
              <h3>{t('product_form.device_label', { number: index + 1 })}</h3>
              <p>{device.color_name} / {device.region} / {device.sim_network} / {device.ram !== 'Default' ? `${device.ram} / ` : ''}{device.storage}</p>
            </div>
            <div className="device-actions">
              <button type="button" className="soft-btn" onClick={() => cloneDevice(index, false)}>{t('product_form.buttons.clone_duplicate')}</button>
              <button type="button" className="danger-btn" onClick={() => removeDevice(index)} disabled={devices.length === 1}>{t('product_form.buttons.remove')}</button>
            </div>
          </div>

          <div className="grid three variant-option-grid">
            <CustomOptionSelect label={t('product_form.labels.color')} value={device.color_name} onChange={(value) => updateDevice(index, 'color_name', value)} options={variantOptions.color} addLabel={t('product_form.buttons.add_color')} onAdd={() => addCustomOption('color', index, 'color_name', t('product_form.custom.color'))} />
            <CustomOptionSelect label={t('product_form.labels.region_variant')} value={device.region} onChange={(value) => updateDevice(index, 'region', value)} options={variantOptions.region} addLabel={t('product_form.buttons.add_variant')} onAdd={() => addCustomOption('region', index, 'region', t('product_form.custom.region'))} />
            <CustomOptionSelect label={t('product_form.labels.sim_network')} value={device.sim_network} onChange={(value) => updateDevice(index, 'sim_network', value)} options={variantOptions.sim} addLabel={t('product_form.buttons.add_sim')} onAdd={() => addCustomOption('sim', index, 'sim_network', t('product_form.custom.sim'))} />
            <CustomOptionSelect label="RAM" value={device.ram} onChange={(value) => updateDevice(index, 'ram', value)} options={variantOptions.ram} addLabel={t('product_form.buttons.add_ram')} onAdd={() => addCustomOption('ram', index, 'ram', t('product_form.custom.ram'))} help={isApple || device.ram === 'Default' ? t('product_form.help.ram_default') : ''} />
            <CustomOptionSelect label={t('product_form.labels.storage')} value={device.storage} onChange={(value) => updateDevice(index, 'storage', value)} options={variantOptions.storage} addLabel={t('product_form.buttons.add_storage')} onAdd={() => addCustomOption('storage', index, 'storage', t('product_form.custom.storage'))} />
          </div>
        </div>
      ))}

      <button type="button" className="primary-outline" onClick={() => setTimeout(() => cloneDevice(devices.length - 1, false), 0)}>+ {t('product_form.buttons.add_new_device_variant')}</button>
    </div>
  );
}

function DeviceIdentityStep({ devices, updateDevice, generateSkuForDevice, cloneDevice, removeDevice }) {
  return (
    <div className="device-list compact-device-list">
      {devices.map((device, index) => (
        <div key={device.client_id} className="device-card harmony-card">
          <div className="device-card-head">
            <div>
              <h3>{t('product_form.device_label', { number: index + 1 })}</h3>
              <p>{device.sku || 'NST-123456789'} / IMEI 1 / IMEI 2</p>
            </div>
            <div className="device-actions">
              <button type="button" className="soft-btn" onClick={() => cloneDevice(index, false)}>{t('product_form.buttons.clone_duplicate')}</button>
              <button type="button" className="danger-btn" onClick={() => removeDevice(index)} disabled={devices.length === 1}>{t('product_form.buttons.remove')}</button>
            </div>
          </div>

          <div className="grid three identity-grid">
            <Select label={t('product_form.labels.sku_type')} value={device.sku_type} onChange={(value) => updateDevice(index, 'sku_type', value)}>
              <option value="random">{t('product_form.options.random_nst_sku')}</option>
              <option value="manual">{t('product_form.options.manual_nst_sku')}</option>
            </Select>
            <Field label={t('product_form.labels.sku_barcode')} value={device.sku} onChange={(value) => updateDevice(index, 'sku', value)} required placeholder="NST-123456789" help={t('product_form.help.sku')} />
            <Field label={t('product_form.labels.model_number_optional')} value={device.model_number} onChange={(value) => updateDevice(index, 'model_number', value)} placeholder="SM-S928B, A3108, etc." />
            <button type="button" className="generate-btn" onClick={() => generateSkuForDevice(index)}>{t('product_form.buttons.generate_nst_sku')}</button>
            <Field label="IMEI 1" value={device.imei_1} onChange={(value) => updateDevice(index, 'imei_1', value)} />
            <Field label="IMEI 2" value={device.imei_2} onChange={(value) => updateDevice(index, 'imei_2', value)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConditionWarrantyStep({ devices, updateDevice, handleDeviceImages, removeDeviceImage, variantOptions, addCustomOption }) {
  return (
    <div className="device-list compact-device-list">
      {devices.map((device, index) => (
        <div key={device.client_id} className="device-card harmony-card">
          <div className="device-card-head">
            <div>
              <h3>{t('product_form.condition_card.title', { number: index + 1 })}</h3>
              <p>{['inactive', 'not_activated', 'boxed'].includes(device.activation_status) ? t('product_form.condition_card.locked') : t('product_form.condition_card.editable')}</p>
            </div>
            <span className="image-count-pill">{t('product_form.images.count', { count: (device.existing_images || []).length + device.images.length })}</span>
          </div>

          <div className="grid three">
            <Select label={t('product_form.labels.activation_status')} value={device.activation_status} onChange={(value) => updateDevice(index, 'activation_status', value)}>
              {variantOptions.status.map((item) => <option key={item.value} value={item.value}>{t(`product_form.activation.${item.value}`, { defaultValue: item.label })}</option>)}
            </Select>
            <Select label={t('product_form.labels.box')} value={device.box_included ? 'yes' : 'no'} onChange={(value) => updateDevice(index, 'box_included', value === 'yes')}>
              <option value="yes">{t('common.yes')}</option>
              <option value="no">{t('common.no')}</option>
            </Select>
            <Field label={t('product_form.labels.battery_health')} value={['inactive', 'not_activated', 'boxed'].includes(device.activation_status) ? '100' : device.battery_health} onChange={(value) => updateDevice(index, 'battery_health', value)} readOnly={['inactive', 'not_activated', 'boxed'].includes(device.activation_status)} help={['inactive', 'not_activated', 'boxed'].includes(device.activation_status) ? t('product_form.help.battery_locked') : ''} />
            <CustomOptionSelect label={t('product_form.labels.warranty')} value={device.warranty} onChange={(value) => updateDevice(index, 'warranty', value)} options={variantOptions.warranty} addLabel={t('product_form.buttons.add_warranty')} onAdd={() => addCustomOption('warranty', index, 'warranty', t('product_form.custom.warranty'))} />
            <div className="span-3"><Textarea label={t('product_form.labels.short_note')} value={device.short_note} onChange={(value) => updateDevice(index, 'short_note', value)} placeholder={t('product_form.placeholders.device_note')} /></div>
          </div>

          <div className="image-panel harmony-image-panel">
            <div className="image-panel-head">
              <div>
                <h4>{t('product_form.images.gallery_title')}</h4>
                <p>{t('product_form.help.images_per_variant')}</p>
              </div>
              <span>{t('product_form.images.selected', { count: (device.existing_images || []).length + device.images.length })}</span>
            </div>
            <input type="file" accept="image/*" multiple onChange={(event) => handleDeviceImages(index, event.target.files)} />
            <div className="image-grid">
              {(device.existing_images || []).map((image, imageIndex) => (
                <div className="image-item" key={`existing_${image.id || imageIndex}`}>
                  <img src={image.url || image.thumbnail_url || image.image_url || image.media_url} alt={image.original_name || t('product_form.images.saved_alt')} />
                  <p>{image.original_name || t('product_form.images.saved_name', { number: imageIndex + 1 })}</p>
                  <button type="button" onClick={() => removeDeviceImage(index, imageIndex, true)}>{t('product_form.buttons.unlink')}</button>
                </div>
              ))}
              {device.image_previews.map((image, imageIndex) => (
                <div className="image-item" key={`${image.name}_${imageIndex}`}>
                  <img src={image.url} alt={image.name} />
                  <p>{image.name}</p>
                  <button type="button" onClick={() => removeDeviceImage(index, imageIndex)}>{t('product_form.buttons.remove')}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OtherDetailsStep({ productId, form, updateForm, productVideo, productVideoPreview, handleVideo, generateSeoNow, seoSuggestion, updateListItem, addListItem, removeListItem }) {
  return (
    <div className="review-accordion-grid simple-content-step">
      <details open>
        <summary>{t('product_form.content.description_seo')}</summary>
        <DescriptionSeoStep form={form} updateForm={updateForm} generateSeoNow={generateSeoNow} seoSuggestion={seoSuggestion} />
      </details>

      <details open>
        <summary>{t('product_form.content.specs')}</summary>
        <div className="simple-spec-wrap">
          <div className="simple-spec-note">
            <strong>{t('product_form.content.manual_works')}</strong>
            <span>{t('product_form.content.manual_help')}</span>
          </div>
          <ManualSpecificationsStep form={form} updateListItem={updateListItem} addListItem={addListItem} removeListItem={removeListItem} />
          {productId ? (
            <details className="advanced-spec-details">
              <summary>{t('product_form.content.advanced_import')}</summary>
              <ProductSpecificationStudio productId={productId} />
            </details>
          ) : (
            <div className="spec-save-first">{t('product_form.content.save_first')}</div>
          )}
        </div>
      </details>

      <details>
        <summary>{t('product_form.content.features_faq')}</summary>
        <FeaturesFaqStep form={form} updateListItem={updateListItem} addListItem={addListItem} removeListItem={removeListItem} />
      </details>

      <details>
        <summary>{t('product_form.content.video_addons')}</summary>
        <div className="simple-optional-stack">
          <VideoStep form={form} updateForm={updateForm} productVideo={productVideo} productVideoPreview={productVideoPreview} handleVideo={handleVideo} />
          <AddonsOnlyStep form={form} updateListItem={updateListItem} addListItem={addListItem} removeListItem={removeListItem} />
        </div>
      </details>
    </div>
  );
}



function FinalReviewStep({ form, devices }) {
  const firstDevice = devices[0] || {};
  return (
    <div className="review-step">
      <div className="summary-panel">
        <h3>{t('product_form.review.final_title')}</h3>
        <div className="review-summary-grid">
          <p><strong>{t('product_form.review.product')}</strong> {form.name || t('product_form.review.not_set')}</p>
          <p><strong>{t('product_form.review.type')}</strong> {t(`product_form.condition.${form.condition || 'new'}`, { defaultValue: String(form.condition || 'new').replace('_', ' ') })}</p>
          <p><strong>{t('product_form.review.total_devices')}</strong> {devices.length}</p>
          <p><strong>{t('product_form.review.first_sku')}</strong> {firstDevice.sku || t('product_form.review.not_set')}</p>
          <p><strong>{t('product_form.review.website')}</strong> {form.website_published ? t('product_form.review.published') : t('product_form.review.unpublished')}</p>
          <p><strong>{t('product_form.review.status')}</strong> {t(`product_form.status.${form.product_status || 'draft'}`, { defaultValue: form.product_status || 'draft' })}</p>
        </div>
      </div>
      <div className="summary-panel">
        <h3>{t('product_form.review.checklist_title')}</h3>
        <div className="final-checklist">
          <p>✓ {t('product_form.review.check_new')}</p>
          <p>✓ {t('product_form.review.check_used')}</p>
          <p>✓ {t('product_form.review.check_sku')}</p>
          <p>✓ {t('product_form.review.check_included')}</p>
        </div>
      </div>
      <div className="review-links"><Link to="/products/image-gallery">{t('product_form.review.open_gallery')}</Link><Link to="/products/variant-operations">{t('product_form.review.open_variant_ops')}</Link></div>
    </div>
  );
}

function ReviewSaveStep({ form, updateForm, devices, productVideo, productVideoPreview, handleVideo, generateSeoNow, seoSuggestion, updateListItem, addListItem, removeListItem }) {
  return (
    <div className="review-step">
      <div className="summary-panel span-2">
        <h3>{t('product_form.review.summary_title')}</h3>
        <div className="review-summary-grid">
          <p><strong>{t('product_form.review.product')}</strong> {form.name || t('product_form.review.not_set')}</p>
          <p><strong>{t('product_form.review.type')}</strong> {t(`product_form.condition.${form.condition}`, { defaultValue: form.condition })}</p>
          <p><strong>{t('product_form.review.total_devices')}</strong> {devices.length}</p>
          <p><strong>{t('product_form.review.first_sku')}</strong> {devices[0]?.sku || 'NST-123456789'}</p>
        </div>
      </div>

      <div className="review-links"><Link to="/products/image-gallery">{t('product_form.review.open_gallery')}</Link><Link to="/products/variant-operations">{t('product_form.review.open_variant_ops')}</Link></div>

      <div className="review-accordion-grid">
        <details open>
          <summary>{t('product_form.content.global_video')}</summary>
          <VideoStep form={form} updateForm={updateForm} productVideo={productVideo} productVideoPreview={productVideoPreview} handleVideo={handleVideo} />
        </details>
        <details>
          <summary>{t('product_form.content.description_seo')}</summary>
          <DescriptionSeoStep form={form} updateForm={updateForm} generateSeoNow={generateSeoNow} seoSuggestion={seoSuggestion} />
        </details>
        <details>
          <summary>{t('product_form.content.features_faq_short')}</summary>
          <FeaturesFaqStep form={form} updateListItem={updateListItem} addListItem={addListItem} removeListItem={removeListItem} />
        </details>
        <details>
          <summary>{t('product_form.content.spec_addons')}</summary>
          <SpecsAddonsStep form={form} updateListItem={updateListItem} addListItem={addListItem} removeListItem={removeListItem} />
        </details>
      </div>
    </div>
  );
}

function DevicesStep({ devices, updateDevice, generateSkuForDevice, cloneDevice, removeDevice, handleDeviceImages, removeDeviceImage, isApple, variantOptions, addCustomOption }) {
  return (
    <div className="device-list">
      {devices.map((device, index) => (
        <div key={device.client_id} className="device-card">
          <div className="device-card-head">
            <div>
              <h3>{t('product_form.device_label', { number: index + 1 })}</h3>
              <p>
                {device.color_name} / {device.region} / {device.sim_network} / {device.ram !== 'Default' ? `${device.ram} / ` : ''}{device.storage}
              </p>
            </div>
            <div className="device-actions">
              <button type="button" className="soft-btn" onClick={() => cloneDevice(index, false)}>{t('product_form.buttons.clone_duplicate')}</button>
              <button type="button" className="danger-btn" onClick={() => removeDevice(index)} disabled={devices.length === 1}>{t('product_form.buttons.remove')}</button>
            </div>
          </div>

          <div className="grid three">
            <Select label={t('product_form.labels.sku_type')} value={device.sku_type} onChange={(value) => updateDevice(index, 'sku_type', value)}>
              <option value="random">{t('product_form.options.random_nst_short')}</option>
              <option value="manual">{t('product_form.options.manual_nst_short')}</option>
            </Select>

            <Field label={t('product_form.labels.sku_barcode')} value={device.sku} onChange={(value) => updateDevice(index, 'sku', value)} required help={t('product_form.help.sku')} />

            <Field label={t('product_form.labels.model_number_optional')} value={device.model_number} onChange={(value) => updateDevice(index, 'model_number', value)} placeholder="SM-S928B, A3108, etc." help={t('product_form.help.model_number')} />

            <button type="button" className="generate-btn" onClick={() => generateSkuForDevice(index)}>{t('product_form.buttons.generate_sku')}</button>

            <Select label={t('product_form.labels.variant_status')} value={device.variant_status} onChange={(value) => updateDevice(index, 'variant_status', value)}>
              <option value="active">{t('product_form.status.active')}</option>
              <option value="inactive">{t('product_form.status.inactive')}</option>
              <option value="draft">{t('product_form.status.draft')}</option>
            </Select>

            <Field label="IMEI 1" value={device.imei_1} onChange={(value) => updateDevice(index, 'imei_1', value)} />
            <Field label="IMEI 2" value={device.imei_2} onChange={(value) => updateDevice(index, 'imei_2', value)} />

            <CustomOptionSelect
              label={t('product_form.labels.color')}
              value={device.color_name}
              onChange={(value) => updateDevice(index, 'color_name', value)}
              options={variantOptions.color}
              addLabel={t('product_form.buttons.add_custom_color')}
              onAdd={() => addCustomOption('color', index, 'color_name', t('product_form.custom.color'))}
            />

            <CustomOptionSelect
              label={t('product_form.labels.region_variant')}
              value={device.region}
              onChange={(value) => updateDevice(index, 'region', value)}
              options={variantOptions.region}
              addLabel={t('product_form.buttons.add_custom_variant')}
              onAdd={() => addCustomOption('region', index, 'region', t('product_form.custom.region'))}
            />

            <CustomOptionSelect
              label={t('product_form.labels.sim_network')}
              value={device.sim_network}
              onChange={(value) => updateDevice(index, 'sim_network', value)}
              options={variantOptions.sim}
              addLabel={t('product_form.buttons.add_custom_sim')}
              onAdd={() => addCustomOption('sim', index, 'sim_network', t('product_form.custom.sim'))}
            />

            <CustomOptionSelect
              label="RAM"
              value={device.ram}
              onChange={(value) => updateDevice(index, 'ram', value)}
              options={variantOptions.ram}
              addLabel={t('product_form.buttons.add_custom_ram')}
              onAdd={() => addCustomOption('ram', index, 'ram', t('product_form.custom.ram'))}
              help={isApple || device.ram === 'Default' ? t('product_form.help.ram_default') : ''}
            />

            <CustomOptionSelect
              label={t('product_form.labels.storage')}
              value={device.storage}
              onChange={(value) => updateDevice(index, 'storage', value)}
              options={variantOptions.storage}
              addLabel={t('product_form.buttons.add_custom_storage')}
              onAdd={() => addCustomOption('storage', index, 'storage', t('product_form.custom.storage'))}
            />

            <Field
              label={t('product_form.labels.battery_health')}
              value={['inactive', 'not_activated', 'boxed'].includes(device.activation_status) ? '100' : device.battery_health}
              onChange={(value) => updateDevice(index, 'battery_health', value)}
              readOnly={['inactive', 'not_activated', 'boxed'].includes(device.activation_status)}
              help={['inactive', 'not_activated', 'boxed'].includes(device.activation_status) ? t('product_form.help.battery_locked') : ''}
            />

            <Field label={t('product_form.labels.purchase_price')} value={device.purchase_price} onChange={(value) => updateDevice(index, 'purchase_price', value)} />
            <Field label={t('product_form.labels.sale_price')} value={device.sale_price} onChange={(value) => updateDevice(index, 'sale_price', value)} required />
            <Field label={t('product_form.labels.market_price')} value={device.market_price} onChange={(value) => updateDevice(index, 'market_price', value)} />

            <CustomOptionSelect
              label={t('product_form.labels.warranty')}
              value={device.warranty}
              onChange={(value) => updateDevice(index, 'warranty', value)}
              options={variantOptions.warranty}
              addLabel={t('product_form.buttons.add_custom_warranty')}
              onAdd={() => addCustomOption('warranty', index, 'warranty', t('product_form.custom.warranty'))}
            />

            <div className="span-3">
              <Textarea label={t('product_form.labels.short_note')} value={device.short_note} onChange={(value) => updateDevice(index, 'short_note', value)} placeholder={t('product_form.placeholders.device_note')} />
            </div>
          </div>

          <div className="image-panel">
            <div className="image-panel-head">
              <div>
                <h4>{t('product_form.images.device_title')}</h4>
                <p>{t('product_form.help.images_watermark')}</p>
              </div>
              <span>{t('product_form.images.selected', { count: (device.existing_images || []).length + device.images.length })}</span>
            </div>

            <input type="file" accept="image/*" multiple onChange={(event) => handleDeviceImages(index, event.target.files)} />

            <div className="image-grid">
              {(device.existing_images || []).map((image, imageIndex) => (
                <div className="image-item" key={`existing_${image.id || imageIndex}`}>
                  <img src={image.url || image.thumbnail_url || image.image_url || image.media_url} alt={image.original_name || t('product_form.images.saved_alt')} />
                  <p>{image.original_name || t('product_form.images.saved_name', { number: imageIndex + 1 })}</p>
                  <button type="button" onClick={() => removeDeviceImage(index, imageIndex, true)}>{t('product_form.buttons.unlink')}</button>
                </div>
              ))}
              {device.image_previews.map((image, imageIndex) => (
                <div className="image-item" key={`${image.name}_${imageIndex}`}>
                  <img src={image.url} alt={image.name} />
                  <p>{image.name}</p>
                  <button type="button" onClick={() => removeDeviceImage(index, imageIndex)}>{t('product_form.buttons.remove')}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <button type="button" className="primary-outline" onClick={() => setTimeout(() => cloneDevice(devices.length - 1, false), 0)}>
        + {t('product_form.buttons.add_new_device')}
      </button>
    </div>
  );
}




function SpecsAddonsStep({ form, updateListItem, addListItem, removeListItem }) {
  return (
    <div className="grid two">
      <div className="list-panel">
        <h3>{t('product_form.content.specification')}</h3>
        {(form.specifications || []).map((spec, index) => (
          <div className="spec-row" key={`spec_${index}`}>
            <input value={spec.name} onChange={(event) => updateListItem('specifications', index, 'name', event.target.value)} placeholder="Display" />
            <input value={spec.value} onChange={(event) => updateListItem('specifications', index, 'value', event.target.value)} placeholder="6.7 inch Super Retina XDR" />
            <button type="button" onClick={() => removeListItem('specifications', index)}>×</button>
          </div>
        ))}
        <button type="button" className="soft-btn" onClick={() => addListItem('specifications', { name: '', value: '' })}>+ {t('product_form.buttons.add_specification')}</button>
      </div>

      <div className="list-panel">
        <h3>{t('product_form.content.addons')}</h3>
        {(form.add_ons || []).map((addon, index) => (
          <div className="spec-row" key={`addon_${index}`}>
            <input value={addon.name} onChange={(event) => updateListItem('add_ons', index, 'name', event.target.value)} placeholder="Charger" />
            <input value={addon.price} onChange={(event) => updateListItem('add_ons', index, 'price', event.target.value)} placeholder={t('product_form.placeholders.price')} />
            <button type="button" onClick={() => removeListItem('add_ons', index)}>×</button>
          </div>
        ))}
        <button type="button" className="soft-btn" onClick={() => addListItem('add_ons', { name: '', price: '', status: 'active' })}>+ {t('product_form.buttons.add_addon')}</button>
      </div>

      <div className="summary-panel span-2">
        <h3>{t('product_form.review.ready')}</h3>
        <p>{t('product_form.review.total_entries')} <strong>{numberFormat(form?.variants?.length || 0)}</strong></p>
        <p className="bn">{t('product_form.help.final_save')}</p>
      </div>
    </div>
  );
}




function CustomOptionSelect({ label, value, onChange, options = [], addLabel = t('product_form.buttons.add_custom'), onAdd, required = false, help = '' }) {
  return (
    <div className="form-field custom-option-field">
      <span>{label}{required && <b>*</b>}</span>
      <div className="select-plus-row">
        <select value={value || ''} onChange={(event) => onChange(event.target.value)} required={required}>
          {options.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" className="mini-add-btn" onClick={onAdd}>+ {addLabel}</button>
      </div>
      {help && <small>{help}</small>}
    </div>
  );
}



