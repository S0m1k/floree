'use client';
import { create } from 'zustand';

// Cross-component UI state: the cart drawer lives in Header, but other
// components (add-to-cart toast, mobile header button) need to open it too.
interface UiStore {
  cartDrawerOpen: boolean;
  openCartDrawer: () => void;
  closeCartDrawer: () => void;
}

export const useUi = create<UiStore>()((set) => ({
  cartDrawerOpen: false,
  openCartDrawer: () => set({ cartDrawerOpen: true }),
  closeCartDrawer: () => set({ cartDrawerOpen: false }),
}));
