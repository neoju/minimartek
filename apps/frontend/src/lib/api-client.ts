import useSWR, { type SWRConfiguration } from "swr";
import useSWRMutation from "swr/mutation";
import type { SWRMutationConfiguration } from "swr/mutation";
import { API_PREFIX, AUTH_HEADER, AUTH_SCHEME } from "@repo/utils";
import { store } from "@/app/store";
import { logout } from "@/features/auth/authSlice";

const API_BASE = import.meta.env.VITE_API_URL ?? API_PREFIX;
console.warn("DEBUGPRINT[305]: api-client.ts:8: VITE_API_URL=", import.meta.env.VITE_API_URL)

type QueryValue = string | number | boolean | Date | null | undefined;
type Falsy = null | undefined | false | 0 | "";
type MutationMethod = "POST" | "PATCH" | "PUT" | "DELETE";

function handleUnauthorizedResponse(): void {
  store.dispatch(logout());

  if (typeof window === "undefined") {
    return;
  }

  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

function authHeaders(): Record<string, string> {
  const token = store.getState().auth.token;

  if (!token) {
    return {};
  }

  return { [AUTH_HEADER]: `${AUTH_SCHEME} ${token}` };
}

function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;

  return `${base}${normalized}`;
}

export function buildApiPath(
  path: string,
  query?: Record<string, QueryValue | QueryValue[]>,
): string {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(query)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    for (const value of values) {
      if (value === null || value === undefined) {
        continue;
      }

      params.append(key, String(value));
    }
  }

  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public info?: any,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function jsonFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  if (!res.ok) {
    let info;

    try {
      info = (await res.json()) as { message?: string };
    } catch {
      info = { message: res.statusText };
    }

    if (res.status === 401) {
      handleUnauthorizedResponse();
    }

    throw new ApiError(
      res.status,
      info.message || res.statusText || `Request failed with status ${res.status}`,
      info,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export async function swrFetcher<T = unknown>(path: string): Promise<T> {
  return jsonFetch<T>(apiUrl(path), { headers: { ...authHeaders() } });
}

export function useQuery<Data = unknown>(
  path: string | Falsy,
  options?: SWRConfiguration<Data, Error> & { fallbackData?: Data },
) {
  const key = path || null;

  return useSWR<Data>(key, (k: string) => swrFetcher<Data>(k), {
    revalidateOnFocus: false,
    ...options,
  });
}

export function useMutation<Data = unknown, Arg = never>(
  path: string | Falsy,
  options?: SWRMutationConfiguration<Data, Error, string, Arg> & {
    throwOnError?: boolean;
    method?: MutationMethod;
  },
) {
  const key = path || "";
  const method = options?.method ?? "POST";

  return useSWRMutation<Data, Error, string, Arg>(
    key,
    async (url: string, { arg }: { arg: Arg }) =>
      jsonFetch<Data>(apiUrl(url), {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: arg !== undefined ? JSON.stringify(arg) : undefined,
      }),
    options,
  );
}

export function useDelete<Data = unknown>(
  path: string | Falsy,
  options?: SWRMutationConfiguration<Data, Error, string, never> & {
    throwOnError?: boolean;
  },
) {
  return useMutation<Data, never>(path, { ...options, method: "DELETE" });
}

export function usePatch<Data = unknown, Arg = never>(
  path: string | Falsy,
  options?: SWRMutationConfiguration<Data, Error, string, Arg> & {
    throwOnError?: boolean;
  },
) {
  return useMutation<Data, Arg>(path, { ...options, method: "PATCH" });
}
