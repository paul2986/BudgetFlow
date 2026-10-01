// An in-memory stand-in for @react-native-async-storage/async-storage. Each
// instance is one device's storage.
export const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    store,
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
    multiRemove: async (keys: string[]) => {
      keys.forEach((key) => store.delete(key));
    },
  };
};

export type MemoryStorage = ReturnType<typeof createMemoryStorage>;
