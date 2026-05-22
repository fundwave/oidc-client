import jwt_decode from "jwt-decode";

interface OIDCClientOptions {
  refreshPath?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

interface TokenResponse {
  token?: string;
  idToken?: string;
  id_token?: string;
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
}

export class OIDCClient {
  #refreshTokenPromise: Promise<void> | null;
  private refreshTokenLock: boolean;
  private refreshPath: string;
  private baseUrl: string | undefined;
  private BASE_HEADERS: Record<string, string>;
  private sessionStorage: Storage | undefined;
  private localStorage: Storage | undefined;

  constructor(options?: OIDCClientOptions, sessionStorageParam?: Storage, localStorageParam?: Storage) {
    this.refreshTokenLock = false;
    this.refreshPath = options?.refreshPath || "token/refresh";
    this.baseUrl = options?.baseUrl;
    this.BASE_HEADERS = options?.headers || {
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
    };
    this.#refreshTokenPromise = null;
    this.sessionStorage = sessionStorageParam ?? (globalThis as any).sessionStorage;
    this.localStorage = localStorageParam ?? (globalThis as any).localStorage;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  getBaseUrl(): string | undefined {
    return this.baseUrl;
  }

  setRefreshPath(path: string): void {
    if (path.startsWith("/")) path = path.slice(1);
    this.refreshPath = path;
  }

  getRefreshPath(): string {
    return this.refreshPath;
  }

  getBaseHeaders(): Record<string, string> {
    return this.BASE_HEADERS;
  }

  lockRefreshTokenLock(): void {
    this.refreshTokenLock = true;
  }

  releaseRefreshTokenLock(): void {
    this.refreshTokenLock = false;
  }

  async prepareHeaders(headers?: Record<string, string>, tokenType: string = "token"): Promise<Record<string, string>> {

    if (!headers) headers = this.BASE_HEADERS;
    const token = await this.getAccessToken(tokenType);
    if (token) return { ...headers, Authorization: `Bearer ${token}` };
    return headers;

  }

  async getAccessToken(tokenType: string = "token"): Promise<string | undefined> {
    
    if (!this.sessionStorage || !this.localStorage || !this.localStorage.getItem("refreshToken")) {
      console.log("Info: Either we're in an environment without storage, or session security is used");
      return;
    }

    try {
      for (let count = 0; this.refreshTokenLock && count < 15; count++) {
        if (this.#refreshTokenPromise) break;
        await this._wait((count) ? (200 * count) : undefined); //delays the next check of refreshTokenLock
      }

      if (this.#refreshTokenPromise) await this.#refreshTokenPromise;
      else if (!this.verifyTokenValidity(tokenType)) await this._refreshToken();

    } catch (err) {
      console.log(err);
      this.sessionStorage?.removeItem("token");
      this.sessionStorage?.removeItem("idToken");
      this.sessionStorage?.removeItem("accessToken");
      this.localStorage?.removeItem("refreshToken");
      if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("logged-out", { bubbles: true, composed: true }));
    }

    return this.sessionStorage.getItem(tokenType) || undefined;

  }

  async _wait(time = 1200): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(function () {
        resolve();
      }, time);
    });
  }

  verifyTokenValidity(tokenType: string = "token"): boolean {
    const token = this.sessionStorage.getItem(tokenType);
    if (!token) return false;
    try {
      const exp = jwt_decode<{ exp: number }>(token);
      return exp && exp.exp >= (new Date().getTime() + 10000) / 1000;
    } catch (err) {
      return false;
    }
  }

  async _refreshToken(): Promise<void> {
    
    const token = this.sessionStorage.getItem("token");
    const refreshToken = this.localStorage.getItem("refreshToken");

    const headers: Record<string, string> = { ...this.BASE_HEADERS };

    if (!refreshToken) throw new Error("No refresh token");

    this.lockRefreshTokenLock();

    if (token) headers["Authorization"] = `Bearer ${token}`;
    headers["Refresh-Token"] = refreshToken;

    const base = this.getBaseUrl();
    if (!base) throw new Error("Missing `baseUrl` argument for OIDCClient");

    const refreshPath = this.getRefreshPath();
    const serviceUrl = base.replace(/\/?$/, "/").concat(refreshPath.replace(/^\/?/, ""));

    this.#refreshTokenPromise = fetch(serviceUrl, { method: "GET", headers: headers })
      .then(async (response) => {
        if (response.status === 403) throw 403;

        const data = await response.json() as TokenResponse;
        const token = data?.token || response.headers?.get?.("token") || undefined;
        const idToken = data?.id_token || data?.idToken || response.headers?.get?.("id_token") || response.headers?.get?.("idToken") || undefined;
        const accessToken = data?.access_token || data?.accessToken || response.headers?.get?.("access_token") || response.headers?.get?.("accessToken") || undefined;
        const refreshToken = data?.refresh_token || data?.refreshToken || response.headers?.get?.("refresh_token") || response.headers?.get?.("refreshToken") || undefined;

        if (!token && !idToken && !accessToken && !refreshToken) throw new Error("Couldn't fetch any of `token`, `id-token`, `access-token` or `refresh-token`");
        if (token) this.sessionStorage.setItem("token", token);
        if (idToken) this.sessionStorage.setItem("idToken", idToken);
        if (accessToken) this.sessionStorage.setItem("accessToken", accessToken);
        if (refreshToken) this.localStorage.setItem("refreshToken", refreshToken);

      })
      .catch((err) => {
        console.log("Failed to refresh tokens", err);
        throw err;
      })
      .finally(() => {
        this.releaseRefreshTokenLock();
        this.#refreshTokenPromise = null;
      });

    return this.#refreshTokenPromise;
  }
}
