import { create } from 'zustand';

interface UiState {
  loadingCount: number;
  increment: () => void;
  decrement: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  loadingCount: 0,
  increment: () =>
    set((state) => ({
      loadingCount: state.loadingCount + 1,
    })),
  decrement: () =>
    set((state) => ({
      loadingCount: Math.max(0, state.loadingCount - 1),
    })),
}));
