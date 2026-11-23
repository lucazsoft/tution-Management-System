declare const __TMS_API_BASE_URL__: string;

export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: ApiFieldError[];
  /** The full JSON error body, for endpoints that return extra detail. */
  readonly body: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    fieldErrors: ApiFieldError[] = [],
    body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.body = body;
  }

  get isAccessDenied() { return this.status === 403; }
  get isNotFound() { return this.status === 404; }
  get isConflict() { return this.status === 409; }
}

function safeBaseUrl(value: string): string {
  const fallback = 'http://localhost:3001/api';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return fallback;
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

export const API_BASE_URL = safeBaseUrl(__TMS_API_BASE_URL__);
export const API_ORIGIN = new URL(API_BASE_URL).origin;

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body != null && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      error?: string; message?: string; fieldErrors?: ApiFieldError[];
    };
    const error = new ApiError(response.status, body.error || body.message || `Request failed (${response.status}).`, body.fieldErrors, body as Record<string, unknown>);
    if (response.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('tms_user');
      sessionStorage.removeItem('tms_user');
      window.location.replace('/session-ended?reason=expired');
    }
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'You do not have authority to perform this action.';
    if (error.status === 404) return 'This record is unavailable or no longer visible.';
    if (error.status === 409) return `${error.message} The latest data has been refreshed.`;
    if (error.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.status === 501) return 'This workflow is not available yet.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}
