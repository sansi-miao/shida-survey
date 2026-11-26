const tokenKey = "survey-admin-token";

export function setToken(value: string) {
  if (value) sessionStorage.setItem(tokenKey, value);
  else sessionStorage.removeItem(tokenKey);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const token = path.startsWith("/api/admin/") && sessionStorage.getItem(tokenKey);
  if (token) headers.set("Authorization", "Bearer " + token);
  const result = await fetch(path, { ...options, headers });
  if (!result.ok) {
    const body = await result.json().catch(() => ({}));
    const message = typeof body.detail === "string" ? body.detail : "请检查输入后重试";
    throw new ApiError(result.status, message);
  }
  return result;
}

export async function query<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await request(path, {
    method,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return response.json() as Promise<T>;
}

export function explain(error: unknown) {
  return error instanceof ApiError ? error.message : "服务暂时不可用，请稍后重试";
}
