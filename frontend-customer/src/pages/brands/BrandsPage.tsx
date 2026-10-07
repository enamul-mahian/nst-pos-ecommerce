import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AlertCircle, ChevronRight, ShieldCheck, Tag } from 'lucide-react';
import { apiClient, handleApiError } from '../../api/client';

interface BrandModel {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  logo_url?: string | null;
  page_settings?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
}

export const BrandsPage: React.FC = () => {
  const [brands, setBrands] = useState<BrandModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setIsLoading(true);
        setError('');
        const response = await apiClient.get('/public/brands');
        const rows = response.data?.data;

        if (active) {
          setBrands(Array.isArray(rows) ? rows : []);
        }
      } catch (requestError) {
        if (active) {
          setBrands([]);
          setError(handleApiError(requestError).message);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] pb-16 text-left">
      <Helmet>
        <title>Shop by Brand | New Singapur Telecom</title>
        <meta
          name="description"
          content="Explore the active brand catalogs published by New Singapur Telecom."
        />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      <div className="border-b border-gray-200 bg-white px-4 py-3.5 text-xs font-semibold text-gray-500 sm:text-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <span className="font-extrabold text-slate-800">Shop by Brand</span>
        </div>
      </div>

      <div className="mx-auto mt-8 flex max-w-7xl flex-col gap-8 px-4">
        <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
          <Tag className="h-5 w-5 text-[var(--nst-primary)]" />
          <h1 className="text-lg font-extrabold text-slate-800 sm:text-2xl">Shop by Brand</h1>
        </div>

        {isLoading ? (
          <div className="flex w-full justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--nst-primary)] border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center">
            <AlertCircle className="mx-auto h-9 w-9 text-red-500" />
            <h2 className="mt-3 font-black text-slate-800">Brands could not be loaded</h2>
            <p className="mt-1 text-sm text-slate-500">{error}</p>
          </div>
        ) : brands.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <h2 className="font-black text-slate-800">No active brands published</h2>
            <p className="mt-2 text-sm text-slate-500">
              Active brands will appear here after they are saved from the POS Brand Manager.
            </p>
          </div>
        ) : (
          <div className="grid w-full grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {brands.map((brand) => {
              const settings = brand.page_settings || {};
              const accent = settings.accent || settings.primary || '#8d39e4';

              return (
                <Link
                  key={brand.id}
                  to={`/brand/${encodeURIComponent(brand.slug)}`}
                  className="group flex min-h-28 flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-6 text-center shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                  style={{ borderBottomColor: accent, borderBottomWidth: 3 }}
                >
                  {brand.logo_url ? (
                    <img
                      src={brand.logo_url}
                      alt={`${brand.name} logo`}
                      className="h-8 max-w-[85%] object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="grid h-10 min-w-10 place-items-center rounded-xl px-3 text-sm font-black text-white"
                      style={{ background: accent }}
                    >
                      {brand.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <strong className="mt-3 text-xs font-black uppercase tracking-wider text-slate-700 group-hover:text-[var(--nst-primary)]">
                    {brand.name}
                  </strong>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center gap-1.5 border-t border-gray-100 pt-4 text-[10px] font-bold uppercase text-gray-400">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>Live catalogs from the active POS brand database</span>
        </div>
      </div>
    </div>
  );
};

export default BrandsPage;
