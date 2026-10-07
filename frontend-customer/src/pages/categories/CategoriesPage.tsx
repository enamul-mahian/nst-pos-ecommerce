import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { CATEGORY_PRESETS } from '../../components/storefront/catalogPresets';

const childPath = (category: string, child: string) => `/search?q=${encodeURIComponent(child)}&category=${encodeURIComponent(category)}`;

/** Phones: Daraz-style left rail + sub-list. Tablet/desktop: category cards with their sub-categories. */
export const CategoriesPage: React.FC = () => {
  const [active, setActive] = useState(0);
  const current = CATEGORY_PRESETS[active];

  return (
    <div className="bg-white">
      <Helmet><title>All Categories | New Singapur Telecom</title><meta name="description" content="Browse all mobile, gadget and accessory categories at New Singapur Telecom." /></Helmet>

      {/* Phone two-pane */}
      <div className="flex min-h-[calc(100dvh-12rem)] md:hidden">
        <nav aria-label="Categories" className="w-[92px] shrink-0 overflow-y-auto bg-slate-50">
          {CATEGORY_PRESETS.map((cat, index) => {
            const Icon = cat.icon;
            const on = index === active;
            return (
              <button key={cat.slug} type="button" onClick={() => setActive(index)} aria-current={on}
                className={`relative flex w-full flex-col items-center gap-1 px-1.5 py-3 text-center text-[11px] leading-tight ${on ? 'bg-white font-semibold text-[var(--nst-primary)]' : 'text-slate-600'}`}>
                {on && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[var(--nst-primary)]" />}
                <Icon className="h-6 w-6" />{cat.label}
              </button>
            );
          })}
        </nav>
        <section className="min-w-0 flex-1 px-3 py-3">
          <Link to={`/category/${current.slug}`} className="mb-2 flex items-center justify-between rounded-lg bg-violet-50 px-3 py-2.5 text-sm font-semibold text-[var(--nst-primary-dark)]">
            All {current.label}<ChevronRight className="h-4 w-4" />
          </Link>
          <ul className="divide-y divide-slate-100">
            {current.children.map((child) => (
              <li key={child}>
                <Link to={childPath(current.label, child)} className="flex items-center justify-between px-1 py-3 text-sm text-slate-700">
                  {child}<ChevronRight className="h-4 w-4 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Tablet / desktop grid */}
      <div className="mx-auto hidden max-w-[1320px] px-4 py-8 md:block lg:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-[13px] text-slate-500"><Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link><ChevronRight className="h-3.5 w-3.5" /><span className="text-slate-700">All Categories</span></nav>
        <h1 className="text-2xl font-semibold text-slate-900">All Categories</h1>
        <p className="mt-1 text-sm text-slate-500">Choose a category to explore related products, brands and offers.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CATEGORY_PRESETS.map((cat) => {
            const Icon = cat.icon;
            return (
              <div key={cat.slug} className="rounded-2xl border border-slate-200 p-5 transition hover:border-violet-300 hover:shadow-md">
                <Link to={`/category/${cat.slug}`} className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-violet-50 text-[var(--nst-primary)]"><Icon className="h-6 w-6" /></span>
                  <span className="text-base font-semibold text-slate-900 hover:text-[var(--nst-primary)]">{cat.label}</span>
                </Link>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {cat.children.slice(0, 8).map((child) => (
                    <Link key={child} to={childPath(cat.label, child)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-violet-50 hover:text-[var(--nst-primary)]">{child}</Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CategoriesPage;
