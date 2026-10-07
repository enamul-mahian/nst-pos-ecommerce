import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ChevronRight, Search } from 'lucide-react';
import { apiClient, handleApiError } from '../../api/client';
import ProductCard from '../../components/catalog/ProductCard';
import type { Product } from '../../types';

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || searchParams.get('search') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [condition, setCondition] = useState(searchParams.get('condition') || '');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuery(searchParams.get('q') || searchParams.get('search') || '');
    setCategory(searchParams.get('category') || '');
    setCondition(searchParams.get('condition') || '');
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError('');
        const response = await apiClient.get('/public/products', {
          params: {
            search: query.trim() || undefined,
            category: category || undefined,
            condition: condition || undefined,
            limit: 100,
          },
        });
        const rows = response.data?.data;
        if (active) setProducts(Array.isArray(rows) ? rows : []);
      } catch (requestError) {
        if (active) {
          setProducts([]);
          setError(handleApiError(requestError).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [category, condition, query]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category).filter(Boolean))),
    [products],
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (query.trim()) next.q = query.trim();
    if (category) next.category = category;
    if (condition) next.condition = condition;
    setSearchParams(next);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-16">
      <Helmet>
        <title>{query ? `Search: ${query}` : 'Product Search'} | New Singapur Telecom</title>
        <meta name="description" content="Search active New Singapur Telecom products from the live POS catalog." />
      </Helmet>

      <div className="border-b border-gray-200 bg-white px-4 py-3.5 text-xs font-semibold text-gray-500 sm:text-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5">
          <Link to="/">Home</Link>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <span className="font-extrabold text-slate-800">Search</span>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-7xl px-4">
        <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_190px_auto]">
          <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Product, brand or model" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-800 outline-none" />
          </label>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-gray-200 px-3 py-3 text-sm text-slate-800">
            <option value="">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={condition} onChange={(event) => setCondition(event.target.value)} className="rounded-xl border border-gray-200 px-3 py-3 text-sm text-slate-800">
            <option value="">All conditions</option>
            <option value="new">New</option>
            <option value="used">Used</option>
            <option value="pre_owned">Pre-Owned</option>
            <option value="refurbished">Refurbished</option>
          </select>
          <button type="submit" className="rounded-xl bg-[var(--nst-primary)] px-6 py-3 text-sm font-black text-white">Search</button>
        </form>

        <div className="mt-7 flex items-end justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-[var(--nst-primary)]">Live POS catalog</p>
            <h1 className="mt-1 text-2xl font-black text-slate-800">{query ? `Results for “${query}”` : 'All Products'}</h1>
          </div>
          {!loading && !error && <span className="text-xs font-bold text-gray-400">{products.length} result(s)</span>}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 pt-6 md:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => <div key={index} className="h-72 animate-pulse rounded-2xl bg-white" />)}
          </div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-white p-8 text-center">
            <AlertCircle className="mx-auto h-9 w-9 text-red-500" />
            <h2 className="mt-3 font-black text-slate-800">Search could not be completed</h2>
            <p className="mt-1 text-sm text-slate-500">{error}</p>
          </div>
        ) : products.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <Search className="mx-auto h-10 w-10 text-gray-300" />
            <h2 className="mt-3 font-black text-slate-800">No matching products</h2>
            <p className="mt-2 text-sm text-slate-500">Try a different product name, brand, category or condition.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
