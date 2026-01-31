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

### Storage Providers

The library now supports flexible storage providers, allowing you to run multiple instances of OIDCClient in parallel without conflicts.

#### Browser Storage Provider (Default)

By default, the library uses `BrowserStorageProvider` which stores tokens in browser's localStorage and sessionStorage:

```js
import { OIDCClient } from "@fundwave/oidc-client";

const oidcClient = new OIDCClient();
// Access token is stored in sessionStorage with key "token"
// Refresh token is stored in localStorage with key "refreshToken"
```

#### Custom Token Names

You can customize the token names to avoid conflicts between multiple instances:

```js
import { OIDCClient } from "@fundwave/oidc-client";

const oidcClient1 = new OIDCClient({
  tokenNames: { token: "token", refreshToken: "refreshToken" }
});

const oidcClient2 = new OIDCClient({
  tokenNames: { token: "token2", refreshToken: "refreshToken2" }
});

// Now both instances can work in parallel using different storage keys
```

#### In-Memory Storage Provider

For temporary storage that doesn't persist between page reloads:

```js
import { OIDCClient, InMemoryStorageProvider } from "@fundwave/oidc-client";

const memoryStorage = new InMemoryStorageProvider();
const oidcClient = new OIDCClient({
  storageProvider: memoryStorage
});

// Tokens are stored in memory and cleared on page reload
```

#### Custom Storage Provider

You can implement your own storage provider (e.g., for MongoDB, IndexedDB, etc.):

```js
import { OIDCClient, StorageProvider } from "@fundwave/oidc-client";

class MyCustomStorageProvider implements StorageProvider {
  async getItem(key: string): Promise<string | null> {
    // Your custom implementation
  }
  
  async setItem(key: string, value: string): Promise<void> {
    // Your custom implementation
  }
  
  async removeItem(key: string): Promise<void> {
    // Your custom implementation
  }
}

const customStorage = new MyCustomStorageProvider();
const oidcClient = new OIDCClient({
  storageProvider: customStorage
});
```

### Usage

Once the class has been instantiated, you can

- use the `prepareHeaders` method to get the required headers for your calls

  ```js
  const headers = await oidcClient.prepareHeaders();
  ```

- Optionally, directly use the `getAccessToken` method to update the tokens (access and refresh) at browser's storage

  ```js
  await oidcClient.getAccessToken();
  ```

- If the refresh-token call returns a `401`/`403` or any other error status, the library will throw an custom-event `logged-out`

### Notes:

- Tokens aren't refreshed every time the `prepareHeaders` method is called. Tokens are only refreshed when the token is about to expire.

- If your client app makes parallel calls to the same object of oidc-client, this library will still make only one active call to your OIDC server. This will reduce network calls and avoid exceeding any rate limits with your OIDC server.

- **Multiple Instances**: You can now run multiple instances of OIDCClient in parallel by using different storage providers or custom token names. This solves the problem of one instance overriding another instance's tokens.

- By default, **Access Token** is maintained at browser's _session storage_ with the key being `token`, and **Refresh Token** is maintained at browser's _local storage_ with the key being `refreshToken`. These can be customized using the `tokenNames` option.

- The library will read tokens sent by your OIDC server from either the response **body** or **headers**
