import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import { Product } from '../../types';

interface WishlistStore {
  items: Product[];
  addItem: (product: Product) => void;
  removeItem: (productId: number) => void;
  clear: () => void;
}

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product) => {
        const currentItems = [...get().items];
        if (currentItems.some((item) => item.id === product.id)) {
          toast.error(`"${product.name}" is already in your wishlist.`);
          return;
        }
        set({ items: [...currentItems, product] });
        toast.success(`"${product.name}" added to wishlist.`);
      },
      removeItem: (productId) => {
        set({ items: get().items.filter((item) => item.id !== productId) });
        toast.success('Product removed from wishlist.');
      },
      clear: () => set({ items: [] }),
    }),
    { name: 'nst_customer_wishlist' }
  )
);
