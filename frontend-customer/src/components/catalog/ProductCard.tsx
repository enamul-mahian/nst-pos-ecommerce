import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, GitCompareArrows, ShoppingCart } from 'lucide-react';
import { Product } from '../../types';
import { useCompareStore } from '../../store/compare/useCompareStore';

export const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const addCompareItem = useCompareStore((state) => state.addItem);
  const compared = useCompareStore((state) => state.items.some((item) => item.id === product.id));
  const inStock = (product.available_quantity ?? product.stock_quantity ?? 0) > 0;
  const preorder = !inStock || product.allow_preorder;
  const image = product.image_url || product.image || 'https://placehold.co/500x500/f8fafc/64748b?text=NST';
  return (
    <article className="catalog-card group">
      <div className="absolute right-3 top-3 z-20 flex flex-col gap-2">
        <button type="button" aria-label="Add to wishlist" className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-400 hover:text-emerald-700"><Heart className="h-4 w-4" /></button>
      </div>
      <Link to={`/product/${product.slug}`} className="catalog-card-image-wrap">
        <img src={image} alt={product.name} className="catalog-card-image" loading="lazy" />
      </Link>
      <div className="catalog-card-body">
        <div className="flex flex-wrap gap-1.5">
          <span className="catalog-badge">{product.condition || 'New'}</span>
          <span className={inStock ? 'catalog-badge is-stock' : 'catalog-badge is-preorder'}>{inStock ? 'In Stock' : 'Pre Order'}</span>
          {product.variants?.some((v) => v.emi_available) && <span className="catalog-badge is-emi">EMI</span>}
        </div>
        <Link to={`/product/${product.slug}`} className="catalog-card-title">{product.name}</Link>
        <p className="catalog-card-meta">{product.brand} · {product.category}</p>
        <button
          type="button"
          onClick={() => addCompareItem(product)}
          className={`mb-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-extrabold transition ${compared ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-700'}`}
        >
          <GitCompareArrows className="h-4 w-4" />
          {compared ? 'Added to Compare' : 'Compare'}
        </button>
        <div className="catalog-card-footer">
          <div>
            <strong>৳{Number(product.sale_price || product.price || 0).toLocaleString('en-BD')}</strong>
            {product.old_price ? <del>৳{Number(product.old_price).toLocaleString('en-BD')}</del> : null}
          </div>
          <Link to={preorder ? `/preorder?product=${encodeURIComponent(product.slug)}` : `/product/${product.slug}`} className="catalog-action-button nst-expand-action nst-expand-action--shop" aria-label={preorder ? 'Pre Order' : 'Add to cart'}>
            <span className="nst-expand-action__label nst-expand-action__label--shop">
              <ShoppingCart className="h-4 w-4" />
              <span>{preorder ? 'Pre Order' : 'Add'}</span>
            </span>
            <span className="nst-expand-action__icon" aria-hidden="true">
              <svg className="nst-expand-action__arrow" viewBox="0 0 32 32" fill="currentColor">
                <path d="M8.489 31.975c-.271 0-.549-.107-.757-.316a1.073 1.073 0 0 1 0-1.515L21.99 15.88 7.94 1.83a1.073 1.073 0 0 1 1.515-1.515l14.807 14.807a1.073 1.073 0 0 1 0 1.515L9.247 31.659a1.07 1.07 0 0 1-.758.316Z" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
};
export default ProductCard;

