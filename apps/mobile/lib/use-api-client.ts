import { useMemo } from "react";
import { useConnection } from "./connection-context";
import { ApiClient } from "./api-client";

/** Null only while unpaired — every screen that uses this is only ever
 * reachable once paired (see app/_layout.tsx), so callers can treat a null
 * return as "shouldn't happen" rather than a real loading state. */
export function useApiClient(): ApiClient | null {
  const { baseUrl, token } = useConnection();
  return useMemo(() => (baseUrl && token ? new ApiClient(baseUrl, token) : null), [baseUrl, token]);
}
