import * as SecureStore from "expo-secure-store";

/**
 * Thin wrapper over expo-secure-store — one place, not SecureStore calls
 * scattered across screens. Both the pairing token (sensitive) and the
 * controller base URL (not sensitive, but not worth a second storage
 * dependency for one string) live here.
 */
const TOKEN_KEY = "claudeops.pairingToken";
const BASE_URL_KEY = "claudeops.controllerBaseUrl";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getBaseUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(BASE_URL_KEY);
}

export async function setBaseUrl(baseUrl: string): Promise<void> {
  await SecureStore.setItemAsync(BASE_URL_KEY, baseUrl);
}

export async function clear(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(BASE_URL_KEY);
}
