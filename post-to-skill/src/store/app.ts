import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_MODEL, type ModelChoice } from '../anthropic/client';

const KEY_API = 'anthropic_api_key';
const KEY_MODEL = 'preferred_model';

type AppState = {
  apiKey: string | null;
  model: ModelChoice;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  setModel: (m: ModelChoice) => Promise<void>;
};

export const useAppStore = create<AppState>((set) => ({
  apiKey: null,
  model: DEFAULT_MODEL,
  hydrated: false,
  hydrate: async () => {
    const [apiKey, model] = await Promise.all([
      SecureStore.getItemAsync(KEY_API),
      SecureStore.getItemAsync(KEY_MODEL),
    ]);
    set({
      apiKey,
      model: (model as ModelChoice) ?? DEFAULT_MODEL,
      hydrated: true,
    });
  },
  setApiKey: async (key: string) => {
    await SecureStore.setItemAsync(KEY_API, key);
    set({ apiKey: key });
  },
  clearApiKey: async () => {
    await SecureStore.deleteItemAsync(KEY_API);
    set({ apiKey: null });
  },
  setModel: async (m: ModelChoice) => {
    await SecureStore.setItemAsync(KEY_MODEL, m);
    set({ model: m });
  },
}));
