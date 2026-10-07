import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CartItem, Product, ProductVariant } from '../../types';

// ==========================================
// 1. Cart Store State & Actions Definitions
// ==========================================
interface CartState {
  items: CartItem[];
  paymentMethod: string; // 'sslcommerz' | 'cash_on_delivery' | string
  shippingMethod: 'inside_dhaka' | 'outside_dhaka' | 'cash_on_delivery' | string;
  deliveryFee: number;
  discount: number;
  subtotal: number;
  total: number;

  // Actions
  addItem: (
    product: Product,
    variant: ProductVariant | null,
    quantity: number,
    selectedStorage?: string | null,
    selectedRam?: string | null,
    selectedSimNetwork?: string | null,
    selectedColor?: string | null,
    selectedCountryRegion?: string | null,
    selectedSimType?: string | null,
    selectedNetworkCarrier?: string | null,
    selectedCondition?: string | null,
    selectedBranchId?: number | null,
    selectedBranchName?: string | null
  ) => void;
  removeItem: (uniqueId: string) => void;
  updateQuantity: (uniqueId: string, quantity: number) => void;
  setPaymentMethod: (method: string) => void;
  setShippingMethod: (method: 'inside_dhaka' | 'outside_dhaka' | 'cash_on_delivery' | string) => void;
  clearCart: () => void;
  recalculateTotals: () => void;
  syncPrices: (changes: { product_id: number; variant_id: number | null; price: number }[]) => void;
}

// Helper to generate a collision-free unique cart item identifier
const generateUniqueId = (productId: number, variantId: number | null, branchId: number | null): string => {
  return `${productId}-${variantId || 'standard'}-${branchId || 'any'}`;
};

// ==========================================
// 2. Zustand Store with Persist Middleware
// ==========================================
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      paymentMethod: 'sslcommerz',
      shippingMethod: 'inside_dhaka',
      deliveryFee: 60, // Default shipping inside Dhaka is ৳60
      discount: 0,
      subtotal: 0,
      total: 0,

      /**
       * Add a product/variant to the cart with duplicate detection & merging
       */
      addItem: (
        product: Product,
        variant: ProductVariant | null,
        quantity: number,
        selectedStorage: string | null = null,
        selectedRam: string | null = null,
        selectedSimNetwork: string | null = null,
        selectedColor: string | null = null,
        selectedCountryRegion: string | null = null,
        selectedSimType: string | null = null,
        selectedNetworkCarrier: string | null = null,
        selectedCondition: string | null = null,
        selectedBranchId: number | null = null,
        selectedBranchName: string | null = null
      ) => {
        const branchId = selectedBranchId || variant?.branch_id || null;
        const uniqueId = generateUniqueId(product.id, variant ? variant.id : null, branchId);
        const currentItems = [...get().items];
        const existingItemIndex = currentItems.findIndex((item) => item.uniqueId === uniqueId);

        // Resolve product available stock
        const availableStock = variant ? variant.available_quantity : product.available_quantity;

        // Resolve unit price for the cart item
        const unitPrice = variant ? variant.price : product.price;
        const oldPrice = variant ? variant.old_price : product.old_price;

        if (existingItemIndex > -1) {
          // If product exists, increment quantity keeping within stock boundaries
          const newQty = currentItems[existingItemIndex].quantity + quantity;
          if (newQty > availableStock) {
            currentItems[existingItemIndex].quantity = availableStock;
          } else {
            currentItems[existingItemIndex].quantity = newQty;
          }
        } else {
          // Add as new cart item
          const newItem: CartItem = {
            uniqueId,
            productId: product.id,
            productName: product.name,
            productImage: variant && variant.image ? variant.image : product.image,
            selectedStorage: selectedStorage || (variant ? variant.storage : null),
            selectedRam: selectedRam || (variant ? variant.ram : null),
            selectedVariant: variant,
            selectedSimNetwork: selectedSimNetwork || (variant ? variant.sim_network : null),
            selectedCountryRegion: selectedCountryRegion || variant?.country_region || variant?.region || null,
            selectedSimType: selectedSimType || variant?.sim_type || null,
            selectedNetworkCarrier: selectedNetworkCarrier || variant?.network_carrier || variant?.sim_network || null,
            selectedCondition: selectedCondition || variant?.condition || product.condition || null,
            selectedBranchId: branchId,
            selectedBranchName: selectedBranchName || variant?.branch_name || null,
            selectedColor: selectedColor || (variant ? variant.color : null),
            quantity: Math.min(quantity, availableStock),
            price: unitPrice,
            oldPrice: oldPrice,
            stockState: variant ? variant.stock_state : null,
          };
          currentItems.push(newItem);
        }

        set({ items: currentItems });
        get().recalculateTotals();
      },

      /**
       * Remove item from cart by unique identifier
       */
      removeItem: (uniqueId: string) => {
        const updatedItems = get().items.filter((item) => item.uniqueId !== uniqueId);
        set({ items: updatedItems });
        get().recalculateTotals();
      },

      /**
       * Update quantity of an item ensuring stock limits are obeyed
       */
      updateQuantity: (uniqueId: string, quantity: number) => {
        const currentItems = get().items.map((item) => {
          if (item.uniqueId === uniqueId) {
            const maxQty = item.selectedVariant
              ? item.selectedVariant.available_quantity
              : 100; // default safe fallback limit
            const validQty = Math.max(1, Math.min(quantity, maxQty));
            return { ...item, quantity: validQty };
          }
          return item;
        });

        set({ items: currentItems });
        get().recalculateTotals();
      },

      /**
       * Set Payment Method and dynamically apply Cash on Delivery ৳200 fee rule
       */
      setPaymentMethod: (method: string) => {
        if (method === 'cash_on_delivery') {
          // Forced checkout rule: Cash on Delivery forces delivery fee to ৳200
          set({
            paymentMethod: method,
            shippingMethod: 'cash_on_delivery',
            deliveryFee: 200,
          });
        } else {
          // If shifting back to digital payments, reset delivery to standard inside Dhaka (৳60)
          set({
            paymentMethod: method,
            shippingMethod: 'inside_dhaka',
            deliveryFee: 60,
          });
        }
        get().recalculateTotals();
      },

      /**
       * Set Shipping Method and update delivery fees correspondingly
       */
      setShippingMethod: (method: 'inside_dhaka' | 'outside_dhaka' | 'cash_on_delivery' | string) => {
        let fee = 60;
        let payment = get().paymentMethod;

        if (method === 'cash_on_delivery') {
          fee = 200;
          payment = 'cash_on_delivery';
        } else if (method === 'outside_dhaka') {
          fee = 120;
          if (payment === 'cash_on_delivery') {
            payment = 'sslcommerz'; // Reset COD constraint if shifting to normal shipping
          }
        } else {
          fee = 60; // Inside Dhaka
          if (payment === 'cash_on_delivery') {
            payment = 'sslcommerz';
          }
        }

        set({
          shippingMethod: method,
          deliveryFee: fee,
          paymentMethod: payment,
        });
        get().recalculateTotals();
      },

      /**
       * Recalculate Subtotal, Delivery fees, Discounts, and Final Grand Total
       */
      /** Put the shop's current prices into the cart (sent back by the server when a cart price is out of date). */
      syncPrices: (changes) => {
        if (!Array.isArray(changes) || !changes.length) return;
        set({
          items: get().items.map((item) => {
            const change = changes.find((row) => Number(row.product_id) === Number(item.productId) && Number(row.variant_id || 0) === Number(item.selectedVariant?.id || 0));
            return change ? { ...item, price: Number(change.price) } : item;
          }),
        });
        get().recalculateTotals();
      },

      recalculateTotals: () => {
        const items = get().items;
        
        // Calculate subtotal
        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        
        // Resolve delivery fee
        const deliveryFee = get().deliveryFee;
        const discount = get().discount;

        // Grand Total = Subtotal + Delivery Fee - Discount
        const total = Math.max(0, subtotal + deliveryFee - discount);

        set({
          subtotal,
          total,
        });
      },

      /**
       * Clear cart and reset settings to default
       */
      clearCart: () => {
        set({
          items: [],
          paymentMethod: 'sslcommerz',
          shippingMethod: 'inside_dhaka',
          deliveryFee: 60,
          discount: 0,
          subtotal: 0,
          total: 0,
        });
      },
    }),
    {
      name: 'nst_shopping_cart', // LocalStorage state cache identifier
      partialize: (state) => ({
        items: state.items,
        paymentMethod: state.paymentMethod,
        shippingMethod: state.shippingMethod,
        deliveryFee: state.deliveryFee,
        discount: state.discount,
      }),
    }
  )
);