import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import type { Product } from '../../types';

interface CompareStore {
  items: Product[];
  addItem: (product: Product) => boolean;
  removeItem: (productId: number) => void;
  clear: () => void;
  hasItem: (productId: number) => boolean;
}

export const useCompareStore = create<CompareStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product) => {
        const items = get().items;
        if (items.some((item) => item.id === product.id)) {
          toast.error(`"${product.name}" is already in your comparison list.`);
          return false;
        }
        if (items.length >= 3) {
          toast.error('You can compare a maximum of 3 products at a time.');
          return false;
        }
        set({ items: [...items, product] });
        toast.success(`"${product.name}" added to comparison list.`);
        return true;
      },
      removeItem: (productId) => set({ items: get().items.filter((item) => item.id !== productId) }),
      clear: () => set({ items: [] }),
      hasItem: (productId) => get().items.some((item) => item.id === productId),
    }),
    { name: 'nst_product_comparison', version: 1 }
  )
);
