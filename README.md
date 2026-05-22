## OIDC Client

@fundwave/oidc-client is a lightweight client-side library that allows you to prepare headers for your network-calls by automatically refreshing tokens (if expired) with the provided OIDC server.

### Installation

```sh
npm install @fundwave/oidc-client
```

### Initialization

```js
import { OIDCClient } from "@fundwave/oidc-client";

const oidcClient = new OIDCClient();

// Set the URL-String where token refresh requests will be sent
oidcClient.setBaseUrl("https://my-awesome-oidc-server.com");

// Set the path on the server which is responsible for the refresh
oidcClient.setRefreshPath("refresh-token");

```

  > Note: the `refreshPath` property defaults to **token/refresh**

  > The constructor signature is `new OIDCClient(options?, sessionStorageParam?, localStorageParam?)`. The two storage params are optional and default to the global `sessionStorage`/`localStorage`. Inject mock storage (e.g. for SSR/Node/tests) by passing them explicitly. If only one is supplied the other resolves from `globalThis`, and the refresh flow is skipped when either is unavailable.

### Usage

Once the class has been instantiated, you can

- use the `prepareHeaders` method to get the required headers for your calls

  ```js
  const headers = await oidcClient.prepareHeaders();
  ```

  `prepareHeaders(headers?, tokenType?)` accepts an optional `tokenType` (defaults to `"token"`) selecting which session-storage key supplies the `Authorization: Bearer` value. Pass `"accessToken"` or `"idToken"` to use those instead.

  ```js
  const headers = await oidcClient.prepareHeaders(undefined, "accessToken");
  ```

- Optionally, directly use the `getAccessToken` method to refresh (if expired) and return a stored token

  ```js
  await oidcClient.getAccessToken();
  ```

  `getAccessToken(tokenType?)` also accepts the optional `tokenType` (defaults to `"token"`) and returns the value stored under that key.

  ```js
  const accessToken = await oidcClient.getAccessToken("accessToken");
  ```

- If the refresh-token call returns a `401`/`403` or any other error status, the library will throw an custom-event `logged-out`

### Notes:

- Tokens aren't refreshed every time the `prepareHeaders` method is called. Tokens are only refreshed when the token is about to expire.

- If your client app makes parallel calls to the same object of oidc-client, this library will still make only one active call to your OIDC server. This will reduce network calls and avoid exceeding any rate limits with your OIDC server.

- Tokens returned by the refresh call are stored at browser's _session storage_ under these keys, when present:
  - `token`
  - `idToken`
  - `accessToken`

- **Refresh Token** is maintained at browser's _local storage_ with the key being `refreshToken`

- On a failed refresh / logout, the `token`, `idToken`, `accessToken` (session storage) and `refreshToken` (local storage) keys are all cleared

- The library will read tokens sent by your OIDC server from either the response **body** or **headers**
