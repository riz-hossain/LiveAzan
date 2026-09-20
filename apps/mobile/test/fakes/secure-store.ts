// An in-memory stand-in for expo-secure-store.
const values = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return values.has(key) ? values.get(key)! : null;
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  values.set(key, value);
}
export async function deleteItemAsync(key: string): Promise<void> {
  values.delete(key);
}
