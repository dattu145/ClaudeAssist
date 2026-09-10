import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ExchangePairingCodeRequestSchema, PairingTokenResponseSchema } from "@claudeops/protocol";
import * as storage from "./storage";

const HEALTH_POLL_INTERVAL_MS = 15_000;

export type ConnectionStatus = "checking" | "connected" | "disconnected";

interface ConnectionContextValue {
  /** Still loading stored credentials from SecureStore on app start. */
  isLoading: boolean;
  isPaired: boolean;
  baseUrl: string | null;
  token: string | null;
  status: ConnectionStatus;
  /** Exchanges a pairing code for a token and persists both. Throws with a
   * human-readable message on failure — the pairing screen shows it. */
  pair: (baseUrl: string, code: string) => Promise<void>;
  /** Clears stored credentials — the "forget this device" action. */
  forget: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [baseUrl, setBaseUrlState] = useState<string | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const [storedBaseUrl, storedToken] = await Promise.all([storage.getBaseUrl(), storage.getToken()]);
      setBaseUrlState(storedBaseUrl);
      setTokenState(storedToken);
      setIsLoading(false);
    })();
  }, []);

  const isPaired = Boolean(baseUrl && token);

  // Bounded, cleared-on-unmount health poll — never an uncontrolled loop.
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!isPaired || !baseUrl) {
      setStatus("checking");
      return;
    }

    let cancelled = false;
    const tick = async () => {
      const ok = await checkHealth(baseUrl);
      if (!cancelled) {
        setStatus(ok ? "connected" : "disconnected");
      }
    };
    void tick();
    pollRef.current = setInterval(tick, HEALTH_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isPaired, baseUrl]);

  const pair = useCallback(async (newBaseUrl: string, code: string) => {
    const trimmedBaseUrl = newBaseUrl.trim().replace(/\/+$/, "");
    const parsedRequest = ExchangePairingCodeRequestSchema.safeParse({ code: code.trim() });
    if (!parsedRequest.success) {
      throw new Error("Enter the pairing code shown in the controller's log.");
    }

    let res: Response;
    try {
      res = await fetch(`${trimmedBaseUrl}/pairing/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsedRequest.data),
      });
    } catch {
      throw new Error("Could not reach the controller at that address.");
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? "Pairing failed — check the code and try again.");
    }

    const parsedResponse = PairingTokenResponseSchema.safeParse(await res.json());
    if (!parsedResponse.success) {
      throw new Error("The controller returned an unexpected response.");
    }

    await storage.setBaseUrl(trimmedBaseUrl);
    await storage.setToken(parsedResponse.data.token);
    setBaseUrlState(trimmedBaseUrl);
    setTokenState(parsedResponse.data.token);
  }, []);

  const forget = useCallback(async () => {
    await storage.clear();
    setBaseUrlState(null);
    setTokenState(null);
    setStatus("checking");
  }, []);

  return (
    <ConnectionContext.Provider value={{ isLoading, isPaired, baseUrl, token, status, pair, forget }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error("useConnection must be used within a ConnectionProvider");
  }
  return ctx;
}
