import { OIDCClient as Client } from "../src";
import { LocalStorageMock } from "./mocks";
import * as jwt from "jsonwebtoken";

const FW_THRESHOLD = 10000; // 10s
// https://www.rfc-editor.org/rfc/rfc7519#section-4.1.4
const timeWithOffsetFromThreshold = (offset: number): number => (Date.now() + (FW_THRESHOLD + offset * 1000)) / 1000;

function setupStorageMocks(): void {
  (global as any).sessionStorage = new LocalStorageMock();
  (global as any).localStorage = new LocalStorageMock();
}

function clearStorageMocks(): void {
  sessionStorage.clear();
  localStorage.clear();
}

function prepareToken(type: 'valid' | 'invalid'): { token: string; expiryTime: number } {
  const threshold = type === "invalid" ? -5 : 5;
  const expiryTime = timeWithOffsetFromThreshold(threshold);
  const token = jwt.sign({ exp: expiryTime }, "secret");

  sessionStorage.setItem("token", token);
  localStorage.setItem("refreshToken", token);

  return { token, expiryTime };
}

let OIDCClient: Client;

beforeAll(() => {
  setupStorageMocks();
});

const providedBaseURL = "https://testing-placeholder.com";
const defaultRefreshPath = "token/refresh";

beforeEach(() => {
  clearStorageMocks();
  OIDCClient = new Client({
    baseUrl: providedBaseURL,
  });
});

test("Get base-url (default)", () => {
  const baseUrl = OIDCClient.getBaseUrl();
  expect(baseUrl).toBe("https://testing-placeholder.com");
});

test("Set base-url", () => {
  OIDCClient.setBaseUrl("https://fundwave.com");
  const baseUrl = OIDCClient.getBaseUrl();
  expect(baseUrl).toBe("https://fundwave.com");
});

test("Verify invalid token", async () => {
  prepareToken("invalid");

  expect(await OIDCClient.verifyTokenValidity()).toBe(false);
});

test("Verify valid token", async () => {
  prepareToken("valid");

  expect(await OIDCClient.verifyTokenValidity()).toBe(true);
});

test("Prepare headers with valid token", async () => {
  expect.assertions(1);

  const { token: validToken } = prepareToken("valid");

  const basicHeaders = {
    "Content-Type": "application/json; charset=UTF-8",
    Accept: "application/json, text/javascript, */*; q=0.01",
  };
  const expected = { ...basicHeaders, Authorization: `Bearer ${validToken}` };

  const received = await OIDCClient.prepareHeaders();
  expect(received).toEqual(expected);
});

test("Prepare headers with invalid token", async () => {
  expect.assertions(1);

  const { expiryTime } = prepareToken("invalid");

  const basicHeaders = {
    "Content-Type": "application/json; charset=UTF-8",
    Accept: "application/json, text/javascript, */*; q=0.01",
  };
  const validToken = jwt.sign({ exp: expiryTime }, "secret");

  (global as any).fetch = jest.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ token: validToken, refreshToken: validToken }),
    })
  );
  const expected = { ...basicHeaders, Authorization: `Bearer ${validToken}` };

  const received = await OIDCClient.prepareHeaders();
  expect(received).toEqual(expected);
});

test("Path used to refresh token", async () => {
  expect.assertions(1);

  const { expiryTime } = prepareToken("invalid");

  const providedRefreshPath = "refreshToken";
  OIDCClient.setRefreshPath(providedRefreshPath);

  const validToken = jwt.sign({ exp: expiryTime }, "secret");
  let suppliedRefreshPath = "";

  (global as any).fetch = jest.fn((url: string) => {
    suppliedRefreshPath = url;
    return Promise.resolve({
      json: () => Promise.resolve({ token: validToken, refreshToken: validToken }),
    });
  });

  await OIDCClient.prepareHeaders();
  expect(suppliedRefreshPath).toEqual(`${providedBaseURL}/${providedRefreshPath}`);
});

test("Path used to refresh token (malformed refresh-path | leading '/')", async () => {
  expect.assertions(1);

  const { expiryTime } = prepareToken("invalid");

  const providedRefreshPath = "refreshToken";
  OIDCClient.setRefreshPath(`/${providedRefreshPath}`);

  const validToken = jwt.sign({ exp: expiryTime }, "secret");
  let suppliedRefreshPath = "";

  (global as any).fetch = jest.fn((url: string) => {
    suppliedRefreshPath = url;
    return Promise.resolve({
      json: () => Promise.resolve({ token: validToken, refreshToken: validToken }),
    });
  });

  await OIDCClient.prepareHeaders();
  expect(suppliedRefreshPath).toEqual(`${providedBaseURL}/${providedRefreshPath}`);
});

test("Refresh Token URL (w/ malformed base-url | trailing '/')", async () => {
  expect.assertions(1);

  const { expiryTime } = prepareToken("invalid");

  const expectedPefreshPath = "https://testing-placeholder.com/refreshToken";
  OIDCClient.setBaseUrl("https://testing-placeholder.com/");
  OIDCClient.setRefreshPath("/refreshToken");

  const validToken = jwt.sign({ exp: expiryTime }, "secret");
  let suppliedRefreshPath = "";

  (global as any).fetch = jest.fn((url: string) => {
    suppliedRefreshPath = url;
    return Promise.resolve({
      json: () => Promise.resolve({ token: validToken, refreshToken: validToken }),
    });
  });

  await OIDCClient.prepareHeaders();
  expect(suppliedRefreshPath).toEqual(expectedPefreshPath);
});

describe("Storage Provider Tests", () => {
  test("BrowserStorageProvider with default token names", async () => {
    const { BrowserStorageProvider } = await import("../src");
    const provider = new BrowserStorageProvider();
    
    provider.setItem("token", "test-token");
    provider.setItem("refreshToken", "test-refresh-token");
    
    expect(provider.getItem("token")).toBe("test-token");
    expect(provider.getItem("refreshToken")).toBe("test-refresh-token");
    expect(sessionStorage.getItem("token")).toBe("test-token");
    expect(localStorage.getItem("refreshToken")).toBe("test-refresh-token");
    
    provider.removeItem("token");
    provider.removeItem("refreshToken");
    
    expect(provider.getItem("token")).toBeNull();
    expect(provider.getItem("refreshToken")).toBeNull();
  });

  test("BrowserStorageProvider with custom token names", async () => {
    const { BrowserStorageProvider } = await import("../src");
    const provider = new BrowserStorageProvider({ token: "customToken", refreshToken: "customRefreshToken" });
    
    provider.setItem("token", "test-token");
    provider.setItem("refreshToken", "test-refresh-token");
    
    expect(provider.getItem("token")).toBe("test-token");
    expect(provider.getItem("refreshToken")).toBe("test-refresh-token");
    expect(sessionStorage.getItem("customToken")).toBe("test-token");
    expect(localStorage.getItem("customRefreshToken")).toBe("test-refresh-token");
    
    // Check that default token names are not used
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
    
    provider.removeItem("token");
    provider.removeItem("refreshToken");
    
    expect(provider.getItem("token")).toBeNull();
    expect(provider.getItem("refreshToken")).toBeNull();
  });

  test("InMemoryStorageProvider", async () => {
    const { InMemoryStorageProvider } = await import("../src");
    const provider = new InMemoryStorageProvider();
    
    provider.setItem("token", "test-token");
    provider.setItem("refreshToken", "test-refresh-token");
    
    expect(provider.getItem("token")).toBe("test-token");
    expect(provider.getItem("refreshToken")).toBe("test-refresh-token");
    
    // Ensure it doesn't touch browser storage
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
    
    provider.removeItem("token");
    expect(provider.getItem("token")).toBeNull();
    expect(provider.getItem("refreshToken")).toBe("test-refresh-token");
    
    provider.clear();
    expect(provider.getItem("refreshToken")).toBeNull();
  });

  test("OIDCClient with custom token names", async () => {
    clearStorageMocks();
    
    const client = new Client({
      baseUrl: providedBaseURL,
      tokenNames: { token: "myToken", refreshToken: "myRefreshToken" }
    });
    
    const { token: validToken } = prepareToken("valid");
    
    // Move tokens to custom names
    sessionStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    sessionStorage.setItem("myToken", validToken);
    localStorage.setItem("myRefreshToken", validToken);
    
    const headers = await client.prepareHeaders();
    expect(headers.Authorization).toBe(`Bearer ${validToken}`);
  });

  test("OIDCClient with InMemoryStorageProvider", async () => {
    expect.assertions(2);
    
    clearStorageMocks(); // Clear any tokens set by prepareToken
    
    const { InMemoryStorageProvider } = await import("../src");
    const provider = new InMemoryStorageProvider();
    
    const client = new Client({
      baseUrl: providedBaseURL,
      storageProvider: provider
    });
    
    const expiryTime = timeWithOffsetFromThreshold(5);
    const validToken = jwt.sign({ exp: expiryTime }, "secret");
    
    // Set tokens in the in-memory provider only
    provider.setItem("token", validToken);
    provider.setItem("refreshToken", validToken);
    
    const headers = await client.prepareHeaders();
    expect(headers.Authorization).toBe(`Bearer ${validToken}`);
    
    // Verify browser storage remains unaffected
    expect(sessionStorage.getItem("token")).toBeNull();
  });

  test("Multiple OIDCClient instances with different storage providers", async () => {
    expect.assertions(4);
    
    clearStorageMocks();
    const { InMemoryStorageProvider } = await import("../src");
    
    // Instance 1: BrowserStorageProvider with default token names
    const client1 = new Client({
      baseUrl: providedBaseURL,
    });
    
    // Instance 2: InMemoryStorageProvider
    const provider2 = new InMemoryStorageProvider();
    const client2 = new Client({
      baseUrl: providedBaseURL,
      storageProvider: provider2
    });
    
    const { token: token1 } = prepareToken("valid");
    const expiryTime2 = timeWithOffsetFromThreshold(5);
    const token2 = jwt.sign({ exp: expiryTime2 }, "different-secret");
    
    // Set different tokens for each instance
    provider2.setItem("token", token2);
    provider2.setItem("refreshToken", token2);
    
    const headers1 = await client1.prepareHeaders();
    const headers2 = await client2.prepareHeaders();
    
    expect(headers1.Authorization).toBe(`Bearer ${token1}`);
    expect(headers2.Authorization).toBe(`Bearer ${token2}`);
    
    // Verify isolation: client1's tokens in browser storage
    expect(sessionStorage.getItem("token")).toBe(token1);
    // Verify client2's tokens NOT in browser storage (only in memory)
    expect(provider2.getItem("token")).toBe(token2);
  });

  test("Multiple OIDCClient instances with different token names", async () => {
    expect.assertions(2);
    
    clearStorageMocks();
    
    // Instance 1: Default token names
    const client1 = new Client({
      baseUrl: providedBaseURL,
    });
    
    // Instance 2: Custom token names
    const client2 = new Client({
      baseUrl: providedBaseURL,
      tokenNames: { token: "token2", refreshToken: "refreshToken2" }
    });
    
    const expiryTime = timeWithOffsetFromThreshold(5);
    const token1 = jwt.sign({ exp: expiryTime }, "secret1");
    const token2 = jwt.sign({ exp: expiryTime }, "secret2");
    
    // Set different tokens for each instance
    sessionStorage.setItem("token", token1);
    localStorage.setItem("refreshToken", token1);
    sessionStorage.setItem("token2", token2);
    localStorage.setItem("refreshToken2", token2);
    
    const headers1 = await client1.prepareHeaders();
    const headers2 = await client2.prepareHeaders();
    
    expect(headers1.Authorization).toBe(`Bearer ${token1}`);
    expect(headers2.Authorization).toBe(`Bearer ${token2}`);
  });
});
