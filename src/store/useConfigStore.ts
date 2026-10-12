import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ConfigState {
  exibirMetragensExtras: boolean;
  toggleExibirMetragensExtras: () => void;
  setExibirMetragensExtras: (value: boolean) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      exibirMetragensExtras: false, // Default is false
      toggleExibirMetragensExtras: () =>
        set((state) => ({ exibirMetragensExtras: !state.exibirMetragensExtras })),
      setExibirMetragensExtras: (value) =>
        set({ exibirMetragensExtras: value }),
    }),
    {
      name: 'app-config-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
