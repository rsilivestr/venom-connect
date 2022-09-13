# VenomConnect

Dev tips:

- _work in progress_
- _temporary supported only import via files; npm support coming soon_

You can find the library file in the folder **./lib"**.

If you want to rebuild this file, use the command `yarn lib`.

---

<br />

# How to use VenomConnect?

## Import VenomConnect

```javascript
import { VenomConnect } from "./lib/venom";
```

## Init VenomConnect with your own settings

VenomConnect accepts an object with settings.

There are two types of settings:

- general settings for this library
  - `theme`
  - `checkNetworkId`
- list of settings for different wallets, connection methods
  - `providersOptions`

### Theme (`theme`)

You can specify one of the preset themes. To do this, you need to pass its name as a string.

Available themes:

- `'light'`
- `'dark'`
- `'venom'`

_As an advanced feature, instead of a preset theme, you can use your own theme object with the individual values you need. You can use standard themes as a template for writing your own themes. They are located in `/src/themes` folder in the repository of this project._

### Expected network ID or IDs (`checkNetworkId`)

Here you need to set the correct network IDs for your site to work.

Available formats:

- `"1000"`
- `[ "1000", /* ... */ ]`

_You don't have to fill in this field, then the default ID is **1000**._

### Providers options (`providersOptions`)

Provider Options is an object in which _the keys are the wallet IDs_ and _the values are the settings objects for the corresponding wallet_.

The keys of the object must accept the IDs of only wallets available in this library.

Currently available IDs (new wallets may be added in the future):

- `venomwallet`
- `everwallet`

The value is an object with the settings of this wallet:

- `links`
- `walletWaysToConnect`
- `defaultWalletWaysToConnect`

### Links (`links`)

This is an object with the necessary links for this wallet:

- `extension`
- `ios`
- `android`
- `qr`
- `apk`

To set **your own link**, pass **_the string_.**

To use **the default link**, pass **_undefined_** or _don't use the needed field at all._

To **hide** the corresponding field, pass **_null_.**

### Ways to connect a wallet (`walletWaysToConnect`)

This is an array with the available ways to connect this wallet, that you want to configure.
If there is no such need, use the `defaultWalletWaysToConnect` field.

**Attention! `type:"extension"` you have to configure anyway**

### Default ways to connect a wallet (`defaultWalletWaysToConnect`)

This is an array with the available ways to connect this wallet, which you want to use if you want to use the default values..

List of default options:

- `"mobile"` — slide with a list of all download links at once
- `"ios"` — slide for showing on ios devices
- `"android"` — slide for showing on android devices

### How to configure `extension`

- Basic options
  - `package` — NPM package
  - `packageOptions` — An object that is passed inside the RPM package during initialization
  - `id` — ID of the corresponding option
  - `type` — type of the corresponding option; `"extension"` for example
- Overwrite default options
  - High-level setup
    - `name` — your own extension name
    - `logo` — your own logo link
  - Low-level setup (advanced)
    - `options`
    - `connector`
    - `authConnector`

```javascript
const initVenomConnect = async () => {
  return new VenomConnect({
    theme: "light",
    providersOptions: {
      venomwallet: {
        links: {
          extension: "...",
          android: undefined,
          ios: null,
        },
        walletWaysToConnect: [
          {
            package: ProviderRpcClient,
            packageOptions: {
              fallback: () =>
                EverscaleStandaloneClient.create({
                  connection: {
                    group: "mainnet",
                    type: "jrpc",
                    data: {
                      endpoint: "https://jrpc-mainnet.venom.rs/rpc",
                    },
                  },
                }).then(
                  (
                    VenomConnect.getPromise("venomwallet", "extension") ||
                    (() => Promise.reject())
                  )()
                ),
              forceUseFallback: true,
            },

            id: "extension",
            type: "extension",
          },
        ],
        defaultWalletWaysToConnect: ["mobile", "ios", "android"],
      },
    },
  });
};

const onInitButtonClick = async () => {
  const venomConnect = await initVenomConnect();
  // you can save venomConnect here

  // and check the Authorization
  await checkAuth(venomConnect);
};
```

## Interaction with the library

### Available methods (API)

The initialized library returns an instance that contains a number of functions available for use:

- `connect`
- `connectTo`
- `checkAuth`
- `on`
- `off`
- `currentProvider` — getter
- `getPromise` — static method
- `updateTheme`
  <!-- - `toggleModal` -->
  <!-- - `getInfo` -->

#### `connect`

This function causes the pop-up to be displayed with the available connection methods: through the extension, links to mobile applications.

#### `connectTo` (advanced)

This function allows you to get a specific provider **bypassing the selection pop-up** `connect(walletId, connectorTypeId)`.

#### `checkAuth`

This function checks authorization in the available connection methods (extensions) and **returns** the corresponding **instance** of the wallet provider or **false**.

#### `on`

**Subscribing** to internal library events. `on(event, callback)`

Returns the corresponding `off` function with no accepted parameters.

#### `off`

**Unsubscribe** from internal library events. `on(event, callback)`

#### `currentProvider`

Returns the current provider. If not authorized returns a current standalone provider.

#### `getPromise`

The function of getting an object with promises, each of which waits for the initialization of the corresponding provider (_for example: `__venom`_) on the `window` object and is resolved by them or after several attempts is rejected.

You can get the promise you need by wallet ID and connection type `getPromise("venomwallet", "extension")` or you can use the default connection type ("extension") `getPromise("venomwallet")`.

#### `updateTheme`

You can use this function to interactively switch themes in runtime.

### Subscribing to events

Available events:

- `select` — after clicking on one of the items; opening the extension window
- `connect` — after authorization in the extension; returns the provider object
- `close` — after the user closes the extension window
- `error`

```javascript
const onConnect = async (provider: ProviderRpcClient | undefined) => {
  // you can save the provider here
};

useEffect(() => {
  const off = venomConnect?.on("connect", onConnect);

  return () => {
    off?.();
  };
}, [venomConnect]);
```

## Connecting/disconnecting to the provider via the VenomConnect pop-up window

```javascript
const onConnectButtonClick = async () => {
  venomConnect?.connect();
};

const onDisconnectButtonClick = async () => {
  venomProvider?.disconnect();
};
```

## Use the provider

```javascript
const getAddress = async (provider: ProviderRpcClient) => {
  // get whatever you want
  const providerState = await provider?.getProviderState?.();

  const address =
    providerState?.permissions.accountInteraction?.address.toString();

  return address;
};
```

## Connecting to the provider after refreshing the page

This check is called before the standard pop-up call (`connect`).

```javascript
const checkAuth = async (venomConnect: VenomConnect) => {
  const authObjectOrFalse = await venomConnect?.checkAuth();

  if (authObjectOrFalse) {
    // You can get the data you need. For example, the address.
    await getAddress(venomConnect);
  }
};
```
