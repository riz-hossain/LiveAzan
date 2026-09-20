// An in-memory stand-in for @react-native-async-storage/async-storage.
const values = new Map<string, string>();

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return values.has(key) ? values.get(key)! : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    values.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    values.delete(key);
  },
  async getAllKeys(): Promise<string[]> {
    return [...values.keys()];
  },
  async clear(): Promise<void> {
    values.clear();
  },
};

export default AsyncStorage;
