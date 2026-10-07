import { useEffect, useState } from 'react';
import { categoryService } from '../../services/categoryService';
import { brandService } from '../../services/brandService';
import { NstPageHeader } from '../../components/ui/nst-page-header';
import { Tags as NstHdrTags } from 'lucide-react';
import { useT } from '../../i18n';

const emptyCategory = {
  parent_id: '',
  name: '',
  slug: '',
  description: '',
  image: '',
  icon: '',
  sort_order: '0',
  status: 'active',
};

const emptyBrand = {
  name: '',
  slug: '',
  description: '',
  logo: '',
  banner: '',
  website: '',
  page_settings: {
    primary: '#15803d',
    secondary: '#064e3b',
    accent: '#f59e0b',
    founded: '',
    headquarters: '',
    meta_title: '',
    meta_description: '',
    show_stats: true,
    show_categories: true,
    show_filters: true,
  },
  sort_order: '0',
  status: 'active',
};

export default function CategoryBrandManager() {
  const t = useT();
  const [activeTab, setActiveTab] = useState('categories');

  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);

  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [brandForm, setBrandForm] = useState(emptyBrand);

  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingBrandId, setEditingBrandId] = useState(null);

  const [categorySearch, setCategorySearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');

  const [categoryStatus, setCategoryStatus] = useState('');
  const [brandStatus, setBrandStatus] = useState('');
  const [selectedBrandIds, setSelectedBrandIds] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [brandfetchLoading, setBrandfetchLoading] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadCategories();
  }, [categorySearch, categoryStatus]);

  useEffect(() => {
    loadBrands();
  }, [brandSearch, brandStatus]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await categoryService.getCategories({
        search: categorySearch,
        status: categoryStatus,
        per_page: 100,
      });

      setCategories(extractList(response));
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Category load failed.'));
    } finally {
      setLoading(false);
    }
  };

  const loadBrands = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await brandService.getBrands({
        search: brandSearch,
        status: brandStatus,
        per_page: 100,
      });

      const list = extractList(response);
      setBrands(list);
      setSelectedBrandIds((previous) =>
        previous.filter((id) => list.some((brand) => Number(brand.id) === Number(id)))
      );
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Brand load failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (e) => {
    const { name, value } = e.target;

    setCategoryForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleBrandChange = (e) => {
    const { name, value } = e.target;

    setBrandForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleBrandSettingChange = (e) => {
    const { name, value, type, checked } = e.target;

    setBrandForm((previous) => ({
      ...previous,
      page_settings: {
        ...previous.page_settings,
        [name]: type === 'checkbox' ? checked : value,
      },
    }));
  };

  const findBrandLogo = async () => {
    if (!brandForm.website.trim()) {
      setError('Enter the official brand website first.');
      return;
    }

    try {
      setBrandfetchLoading(true);
      setMessage('');
      setError('');
      const response = await brandService.getLogoSuggestion({
        website: brandForm.website,
        theme: 'light',
        type: 'logo',
      });
      const logoUrl = response?.data?.logo_url;

      if (!logoUrl) {
        throw new Error('No logo suggestion returned.');
      }

      setBrandForm((previous) => ({ ...previous, logo: logoUrl }));
      setMessage('Official logo suggestion added. Save the brand to publish it.');
    } catch (err) {
      setError(getErrorMessage(err, 'Brand logo suggestion failed.'));
    } finally {
      setBrandfetchLoading(false);
    }
  };

  const saveCategory = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setMessage('');
      setError('');

      const payload = {
        ...categoryForm,
        parent_id: categoryForm.parent_id || null,
        sort_order: Number(categoryForm.sort_order || 0),
      };

      if (editingCategoryId) {
        await categoryService.updateCategory(editingCategoryId, payload);
        setMessage('Category updated successfully.');
      } else {
        await categoryService.createCategory(payload);
        setMessage('Category created successfully.');
      }

      setCategoryForm(emptyCategory);
      setEditingCategoryId(null);
      await loadCategories();
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Category save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const saveBrand = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setMessage('');
      setError('');

      const payload = {
        ...brandForm,
        sort_order: Number(brandForm.sort_order || 0),
      };

      if (editingBrandId) {
        await brandService.updateBrand(editingBrandId, payload);
        setMessage('Brand updated successfully.');
      } else {
        await brandService.createBrand(payload);
        setMessage('Brand created successfully.');
      }

      setBrandForm(emptyBrand);
      setEditingBrandId(null);
      await loadBrands();
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Brand save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const editCategory = (category) => {
    setActiveTab('categories');
    setEditingCategoryId(category.id);

    setCategoryForm({
      parent_id: category.parent_id || '',
      name: category.name || '',
      slug: category.slug || '',
      description: category.description || '',
      image: category.image || '',
      icon: category.icon || '',
      sort_order: String(category.sort_order || 0),
      status: category.status || 'active',
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const editBrand = (brand) => {
    setActiveTab('brands');
    setEditingBrandId(brand.id);

    setBrandForm({
      name: brand.name || '',
      slug: brand.slug || '',
      description: brand.description || '',
      logo: brand.logo || '',
      banner: brand.banner || '',
      website: brand.website || '',
      page_settings: {
        ...emptyBrand.page_settings,
        ...(brand.page_settings || {}),
      },
      sort_order: String(brand.sort_order || 0),
      status: brand.status || 'active',
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteCategory = async (category) => {
    const confirmed = window.confirm(`Delete category "${category.name}"?`);

    if (!confirmed) return;

    try {
      setMessage('');
      setError('');

      await categoryService.deleteCategory(category.id);

      setMessage('Category deleted successfully.');
      await loadCategories();
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Category delete failed.'));
    }
  };

  const deleteBrand = async (brand) => {
    const confirmed = window.confirm(`Delete brand "${brand.name}"?`);

    if (!confirmed) return;

    try {
      setMessage('');
      setError('');

      await brandService.deleteBrand(brand.id);

      setMessage('Brand deleted successfully.');
      await loadBrands();
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Brand delete failed.'));
    }
  };

  const toggleBrandSelection = (brandId) => {
    const numericId = Number(brandId);

    setSelectedBrandIds((previous) => {
      if (previous.includes(numericId)) {
        return previous.filter((id) => id !== numericId);
      }

      return [...previous, numericId];
    });
  };

  const toggleAllVisibleBrands = () => {
    const visibleIds = brands.map((brand) => Number(brand.id));
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedBrandIds.includes(id));

    if (allSelected) {
      setSelectedBrandIds((previous) => previous.filter((id) => !visibleIds.includes(id)));
      return;
    }

    setSelectedBrandIds((previous) => Array.from(new Set([...previous, ...visibleIds])));
  };

  const bulkDeleteBrands = async () => {
    if (selectedBrandIds.length === 0) {
      setError('Please select at least one brand first.');
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedBrandIds.length} selected brand(s)? Brands with existing products will be skipped for safety.`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setMessage('');
      setError('');

      const response = await brandService.bulkDeleteBrands(selectedBrandIds);
      const result = response?.data || {};
      const skipped = result.skipped || [];

      setSelectedBrandIds([]);
      setMessage(
        response?.message ||
          `Bulk delete completed. Deleted: ${result.deleted_count || 0}, Skipped: ${result.skipped_count || 0}.`
      );

      if (skipped.length > 0) {
        setError(
          `${skipped.length} brand(s) were skipped because they have products: ${skipped
            .map((brand) => `${brand.name} (${brand.product_count})`)
            .join(', ')}`
        );
      }

      await loadBrands();
    } catch (err) {
      console.log(err);
      setError(getErrorMessage(err, 'Bulk brand delete failed.'));
    } finally {
      setSaving(false);
    }
  };

  const cancelCategoryEdit = () => {
    setEditingCategoryId(null);
    setCategoryForm(emptyCategory);
  };

  const cancelBrandEdit = () => {
    setEditingBrandId(null);
    setBrandForm(emptyBrand);
  };

  const visibleBrandIds = brands.map((brand) => Number(brand.id));
  const allVisibleBrandsSelected =
    visibleBrandIds.length > 0 && visibleBrandIds.every((id) => selectedBrandIds.includes(id));

  return (
    <div className="min-h-screen bg-[#FAF7FF] p-6">
      <NstPageHeader icon={NstHdrTags} title={t('catalog.title')} subtitle={t('catalog.subtitle')}/>

      {message && (
        <div className="mb-4 bg-green-50 text-green-700 border border-green-200 px-4 py-3 rounded-lg">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 text-red-600 border border-red-200 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] mb-6 overflow-hidden">
        <div className="flex">
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`px-6 py-4 text-sm font-semibold border-b-2 ${
              activeTab === 'categories'
                ? 'border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] text-[var(--nst-dashboard-primary)] bg-[var(--nst-dashboard-primary-soft)]'
                : 'border-transparent text-gray-500 hover:text-[var(--nst-dashboard-primary)]'
            }`}
          >
            Categories
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('brands')}
            className={`px-6 py-4 text-sm font-semibold border-b-2 ${
              activeTab === 'brands'
                ? 'border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] text-[var(--nst-dashboard-primary)] bg-[var(--nst-dashboard-primary-soft)]'
                : 'border-transparent text-gray-500 hover:text-[var(--nst-dashboard-primary)]'
            }`}
          >
            Brands
          </button>
        </div>
      </div>

      {activeTab === 'categories' ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <form onSubmit={saveCategory} className="bg-white rounded-xl shadow-sm border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] p-6 space-y-4">
            <h2 className="text-lg font-bold text-[var(--nst-dashboard-primary)]">
              {editingCategoryId ? 'Edit Category' : 'Add New Category'}
            </h2>

            <InputField
              label="Category Name *"
              name="name"
              value={categoryForm.name}
              onChange={handleCategoryChange}
              placeholder="Example: Smartphone"
              required
            />

            <InputField
              label="Slug"
              name="slug"
              value={categoryForm.slug}
              onChange={handleCategoryChange}
              placeholder={t('common.leave_blank_auto')}
            />

            <div>
              <label className="block text-sm font-medium text-[var(--nst-dashboard-primary)] mb-1">
                Parent Category
              </label>
              <select
                name="parent_id"
                value={categoryForm.parent_id}
                onChange={handleCategoryChange}
                className={inputClass()}
              >
                <option value="">No Parent</option>
                {categories
                  .filter((category) => category.id !== editingCategoryId)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--nst-dashboard-primary)] mb-1">
                Description
              </label>
              <textarea
                name="description"
                rows="4"
                value={categoryForm.description}
                onChange={handleCategoryChange}
                placeholder="Category description"
                className={inputClass()}
              />
            </div>

            <InputField
              label="Image Path / URL"
              name="image"
              value={categoryForm.image}
              onChange={handleCategoryChange}
              placeholder="Optional"
            />

            <InputField
              label="Icon"
              name="icon"
              value={categoryForm.icon}
              onChange={handleCategoryChange}
              placeholder="Optional"
            />

            <InputField
              type="number"
              label="Sort Order"
              name="sort_order"
              value={categoryForm.sort_order}
              onChange={handleCategoryChange}
              placeholder="0"
            />

            <div>
              <label className="block text-sm font-medium text-[var(--nst-dashboard-primary)] mb-1">
                Status
              </label>
              <select
                name="status"
                value={categoryForm.status}
                onChange={handleCategoryChange}
                className={inputClass()}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-5 py-2.5 rounded-lg bg-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary)] text-white font-semibold disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingCategoryId ? 'Update Category' : 'Add Category'}
              </button>

              {editingCategoryId && (
                <button
                  type="button"
                  onClick={cancelCategoryEdit}
                  className="px-5 py-2.5 rounded-lg border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] text-[var(--nst-dashboard-primary)] bg-white hover:bg-[var(--nst-dashboard-primary-soft)]"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
              <h2 className="text-lg font-bold text-[var(--nst-dashboard-primary)]">Category List</h2>

              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Search category..."
                  className={inputClass()}
                />

                <select
                  value={categoryStatus}
                  onChange={(e) => setCategoryStatus(e.target.value)}
                  className={inputClass()}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-center text-[var(--nst-dashboard-primary)] py-10">Loading...</div>
            ) : categories.length === 0 ? (
              <div className="text-center text-gray-400 py-10">No category found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]">
                      <th className="p-3 text-left">Name</th>
                      <th className="p-3 text-left">Slug</th>
                      <th className="p-3 text-left">Parent</th>
                      <th className="p-3 text-left">Sort</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {categories.map((category) => (
                      <tr key={category.id} className="border-b border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]">
                        <td className="p-3 font-semibold text-[var(--nst-dashboard-primary)]">{category.name}</td>
                        <td className="p-3 text-gray-500">{category.slug}</td>
                        <td className="p-3 text-gray-500">{category.parent?.name || '-'}</td>
                        <td className="p-3 text-gray-500">{category.sort_order}</td>
                        <td className="p-3">
                          <StatusBadge status={category.status} />
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => editCategory(category)}
                              className="px-3 py-1.5 rounded bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] font-semibold"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteCategory(category)}
                              className="px-3 py-1.5 rounded bg-red-50 text-red-600 font-semibold"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <form onSubmit={saveBrand} className="bg-white rounded-xl shadow-sm border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] p-6 space-y-4">
            <h2 className="text-lg font-bold text-[var(--nst-dashboard-primary)]">
              {editingBrandId ? 'Edit Brand' : 'Add New Brand'}
            </h2>

            <InputField
              label="Brand Name *"
              name="name"
              value={brandForm.name}
              onChange={handleBrandChange}
              placeholder="Example: Apple"
              required
            />

            <InputField
              label="Slug"
              name="slug"
              value={brandForm.slug}
              onChange={handleBrandChange}
              placeholder={t('common.leave_blank_auto')}
            />

            <div>
              <label className="block text-sm font-medium text-[var(--nst-dashboard-primary)] mb-1">
                Description
              </label>
              <textarea
                name="description"
                rows="4"
                value={brandForm.description}
                onChange={handleBrandChange}
                placeholder="Brand description"
                className={inputClass()}
              />
            </div>

            <InputField
              label="Logo Path / URL"
              name="logo"
              value={brandForm.logo}
              onChange={handleBrandChange}
              placeholder="Optional"
            />

            <InputField
              label="Banner Path / URL"
              name="banner"
              value={brandForm.banner}
              onChange={handleBrandChange}
              placeholder="Optional"
            />

            <InputField
              label="Website"
              name="website"
              value={brandForm.website}
              onChange={handleBrandChange}
              placeholder="https://example.com"
            />

            <button
              type="button"
              onClick={findBrandLogo}
              disabled={brandfetchLoading || !brandForm.website.trim()}
              className="w-full rounded-lg border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] bg-[var(--nst-dashboard-primary-soft)] px-4 py-2.5 text-sm font-bold text-[var(--nst-dashboard-primary)] disabled:opacity-50"
            >
              {brandfetchLoading ? 'Finding official logo...' : 'Find Logo from Official Website'}
            </button>

            {brandForm.logo && (
              <div className="rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-3">
                <p className="mb-2 text-xs font-bold text-[var(--nst-dashboard-muted)]">Logo preview</p>
                <img src={brandForm.logo} alt="Brand logo preview" className="h-12 max-w-full object-contain" />
              </div>
            )}

            <details className="rounded-xl border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-bg)] p-4" open>
              <summary className="cursor-pointer text-sm font-black text-[var(--nst-dashboard-text)]">
                Brand Page Design & SEO
              </summary>

              <div className="mt-4 grid gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <ColorField label="Primary" name="primary" value={brandForm.page_settings.primary} onChange={handleBrandSettingChange} />
                  <ColorField label="Secondary" name="secondary" value={brandForm.page_settings.secondary} onChange={handleBrandSettingChange} />
                  <ColorField label="Accent" name="accent" value={brandForm.page_settings.accent} onChange={handleBrandSettingChange} />
                </div>

                <InputField label="Founded" name="founded" value={brandForm.page_settings.founded} onChange={handleBrandSettingChange} placeholder="Example: 1976" />
                <InputField label="Headquarters" name="headquarters" value={brandForm.page_settings.headquarters} onChange={handleBrandSettingChange} placeholder="Example: Cupertino, USA" />
                <InputField label="SEO Title" name="meta_title" value={brandForm.page_settings.meta_title} onChange={handleBrandSettingChange} placeholder="Optional brand page title" />

                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--nst-dashboard-primary)]">SEO Description</label>
                  <textarea
                    name="meta_description"
                    rows="3"
                    value={brandForm.page_settings.meta_description}
                    onChange={handleBrandSettingChange}
                    className={inputClass()}
                    placeholder="Optional brand page meta description"
                  />
                </div>

                <div className="grid gap-2 text-sm text-[var(--nst-dashboard-text)]">
                  <ToggleField label="Show Brand Statistics" name="show_stats" checked={brandForm.page_settings.show_stats} onChange={handleBrandSettingChange} />
                  <ToggleField label="Show Category Filter" name="show_categories" checked={brandForm.page_settings.show_categories} onChange={handleBrandSettingChange} />
                  <ToggleField label="Show Product Filters" name="show_filters" checked={brandForm.page_settings.show_filters} onChange={handleBrandSettingChange} />
                </div>
              </div>
            </details>

            <InputField
              type="number"
              label="Sort Order"
              name="sort_order"
              value={brandForm.sort_order}
              onChange={handleBrandChange}
              placeholder="0"
            />

            <div>
              <label className="block text-sm font-medium text-[var(--nst-dashboard-primary)] mb-1">
                Status
              </label>
              <select
                name="status"
                value={brandForm.status}
                onChange={handleBrandChange}
                className={inputClass()}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-5 py-2.5 rounded-lg bg-[var(--nst-dashboard-primary)] hover:bg-[var(--nst-dashboard-primary)] text-white font-semibold disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingBrandId ? 'Update Brand' : 'Add Brand'}
              </button>

              {editingBrandId && (
                <button
                  type="button"
                  onClick={cancelBrandEdit}
                  className="px-5 py-2.5 rounded-lg border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] text-[var(--nst-dashboard-primary)] bg-white hover:bg-[var(--nst-dashboard-primary-soft)]"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] p-6">
            <div className="flex flex-col gap-4 mb-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[var(--nst-dashboard-primary)]">Brand List</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Select multiple brands and delete together. Brands with products will be skipped safely.
                  </p>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                  <input
                    value={brandSearch}
                    onChange={(e) => setBrandSearch(e.target.value)}
                    placeholder="Search brand..."
                    className={inputClass()}
                  />

                  <select
                    value={brandStatus}
                    onChange={(e) => setBrandStatus(e.target.value)}
                    className={inputClass()}
                  >
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[var(--nst-dashboard-primary-soft)] border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-xl px-4 py-3">
                <div className="text-sm text-[var(--nst-dashboard-primary)]">
                  Selected: <span className="font-bold">{selectedBrandIds.length}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={toggleAllVisibleBrands}
                    disabled={brands.length === 0}
                    className="px-4 py-2 rounded-lg bg-white border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] text-[var(--nst-dashboard-primary)] font-semibold disabled:opacity-50"
                  >
                    {allVisibleBrandsSelected ? 'Unselect Visible' : 'Select Visible'}
                  </button>

                  <button
                    type="button"
                    onClick={bulkDeleteBrands}
                    disabled={saving || selectedBrandIds.length === 0}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Deleting...' : 'Delete Selected'}
                  </button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center text-[var(--nst-dashboard-primary)] py-10">Loading...</div>
            ) : brands.length === 0 ? (
              <div className="text-center text-gray-400 py-10">No brand found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)]">
                      <th className="p-3 text-left w-12">
                        <input
                          type="checkbox"
                          checked={allVisibleBrandsSelected}
                          onChange={toggleAllVisibleBrands}
                          className="h-4 w-4 accent-[var(--nst-dashboard-primary)]"
                        />
                      </th>
                      <th className="p-3 text-left">Name</th>
                      <th className="p-3 text-left">Slug</th>
                      <th className="p-3 text-left">Website</th>
                      <th className="p-3 text-left">Sort</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {brands.map((brand) => (
                      <tr key={brand.id} className="border-b border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))]">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedBrandIds.includes(Number(brand.id))}
                            onChange={() => toggleBrandSelection(brand.id)}
                            className="h-4 w-4 accent-[var(--nst-dashboard-primary)]"
                          />
                        </td>
                        <td className="p-3 font-semibold text-[var(--nst-dashboard-primary)]">{brand.name}</td>
                        <td className="p-3 text-gray-500">{brand.slug}</td>
                        <td className="p-3 text-gray-500">{brand.website || '-'}</td>
                        <td className="p-3 text-gray-500">{brand.sort_order}</td>
                        <td className="p-3">
                          <StatusBadge status={brand.status} />
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => editBrand(brand)}
                              className="px-3 py-1.5 rounded bg-[var(--nst-dashboard-primary-soft)] text-[var(--nst-dashboard-primary)] font-semibold"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteBrand(brand)}
                              className="px-3 py-1.5 rounded bg-red-50 text-red-600 font-semibold"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ColorField({ label, name, value, onChange }) {
  return (
    <label className="text-xs font-bold text-[var(--nst-dashboard-muted)]">
      {label}
      <input type="color" name={name} value={value || '#15803d'} onChange={onChange} className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-[var(--nst-dashboard-border)] bg-white p-1" />
    </label>
  );
}

function ToggleField({ label, name, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--nst-dashboard-border)] bg-[var(--nst-dashboard-surface)] px-3 py-2">
      <span className="font-semibold">{label}</span>
      <input type="checkbox" name={name} checked={Boolean(checked)} onChange={onChange} className="h-4 w-4 accent-[var(--nst-dashboard-primary)]" />
    </label>
  );
}

function InputField({ label, name, value, onChange, placeholder, type = 'text', required = false }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--nst-dashboard-primary)] mb-1">
        {label}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={inputClass()}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  const active = status === 'active';

  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
        active
          ? 'bg-green-50 text-green-700 border border-green-100'
          : 'bg-red-50 text-red-600 border border-red-100'
      }`}
    >
      {status}
    </span>
  );
}

function inputClass() {
  return 'w-full border border-[color-mix(in_srgb,var(--nst-dashboard-primary)_36%,var(--nst-dashboard-border))] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nst-dashboard-primary)_28%,transparent)] bg-white';
}

function extractList(response) {
  const data = response?.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  return [];
}

function getErrorMessage(error, fallback) {
  if (error?.response?.data?.errors) {
    const errors = error.response.data.errors;
    const firstError = Object.values(errors)?.[0]?.[0];

    if (firstError) {
      return firstError;
    }
  }

  return error?.response?.data?.message || fallback;
}