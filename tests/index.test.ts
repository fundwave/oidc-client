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
