import { isIOS, isMobile } from "react-device-detect";
import { createRoot, Root } from "react-dom/client";
import { Modal } from "./components";
import { getPromiseRaw, ProviderController } from "./controllers";
import { EventController } from "./controllers/EventController";
import {
  CLOSE_EVENT,
  CONNECT_EVENT,
  ERROR_EVENT,
  Events,
  SELECT_EVENT,
} from "./helpers/events";
import * as allProviders from "./providers";
import { getThemeConfig, ThemeNameList, themesList } from "./themes";
import {
  ProviderOptionsListWithOnClick,
  SimpleFunction,
  ThemeConfig,
  UserProvidersOptions,
  VenomConnectOptions,
  WalletDisplay,
} from "./types";

export const libName = "VenomConnect";

let oldRoot: Root | undefined = undefined;

const defaultOptions: VenomConnectOptions = {
  theme: themesList.default.name,
  providersOptions: {},
  checkNetworkId: 1000,
};
class VenomConnect {
  private show: boolean = false;

  private themeConfig: ThemeConfig;
  private options: ProviderOptionsListWithOnClick;
  private providerController: ProviderController;
  private eventController: EventController = new EventController();
  // private pagePosition: number | null = null;

  constructor(options: {
    theme?: VenomConnectOptions["theme"];
    providersOptions: VenomConnectOptions["providersOptions"];
    checkNetworkId?: number | number[];
  }) {
    const theme = options.theme || defaultOptions.theme;
    this.themeConfig = getThemeConfig(theme);

    this.providerController = new ProviderController({
      providersOptions: Object.fromEntries(
        Object.entries(options.providersOptions)?.map(([key, value]) => {
          const defaultAnyProviderOptions:
            | VenomConnectOptions["providersOptions"][0]
            | undefined = defaultOptions.providersOptions?.[key];

          const defaultCurrentProviderOptions:
            | VenomConnectOptions["providersOptions"][0]
            // @ts-ignore
            | undefined = allProviders.providers?.[key];

          const defaultProviderOptions: any = {
            ...(defaultAnyProviderOptions || {}),
            ...(defaultCurrentProviderOptions || {}),
          };

          const providerOptions: UserProvidersOptions["x"] = {
            wallet: {
              ...{
                name: "your wallet",
              },
              ...defaultProviderOptions?.wallet,
              ...value.wallet,
              logo: !!value.wallet?.logo
                ? value.wallet.logo
                : defaultProviderOptions?.wallet?.logo || undefined,
            } as WalletDisplay,
            links: value.links,
            walletWaysToConnect: value.walletWaysToConnect?.length
              ? value.walletWaysToConnect ||
                defaultProviderOptions?.walletWaysToConnect ||
                []
              : defaultProviderOptions?.walletWaysToConnect,
            defaultWalletWaysToConnect: value.defaultWalletWaysToConnect || [],
          };

          return [
            key,
            {
              ...defaultProviderOptions,
              ...providerOptions,
            },
          ];
        })
      ),
      checkNetworkId: options.checkNetworkId || defaultOptions.checkNetworkId,
    });

    this.providerController.on(CONNECT_EVENT, (provider) =>
      this.onConnect(provider)
    );
    this.providerController.on(ERROR_EVENT, (error) => this.onError(error));
    this.providerController.on(SELECT_EVENT, this.onProviderSelect);

    this.options = this.providerController.getOptions();

    this.renderModal();
  }

  // --------------- PUBLIC METHODS --------------- //

  public async toggleModal(): Promise<void> {
    await this._toggleModal();
  }

  // работа с логином
  // покажем попап со способами подключения (для мобил - сразу выбор аккаунта)
  // как использовать в случае если уже залогинен - непонятно
  public connect = (): Promise<any> =>
    new Promise(async (resolve, reject) => {
      this.updateState({
        wrongNetwork: undefined,
      });

      this.on(CONNECT_EVENT, (provider) => resolve(provider));
      this.on(ERROR_EVENT, (error) => reject(error));
      this.on(CLOSE_EVENT, () => reject("Modal closed by user"));

      const connectorIdList = Object.keys(allProviders.connectors);
      const authList = await this.checkAuth(connectorIdList);

      if (!authList || !authList.length) {
        // проверяем что мобильный venom
        if (this.checkIsWalletBrowser().isVenomWalletBrowser) {
          await this.connectTo("venomwallet", "extension");

          // проверяем что мобильный ever
        } else if (this.checkIsWalletBrowser().isEverWalletBrowser) {
          await this.connectTo("everwallet", "extension");

          // показываем обычный попап
        } else {
          await this._toggleModal();
        }
      }
    });

  public connectTo = (id: string, connectorId: string): Promise<any> =>
    new Promise(async (resolve, reject) => {
      this.on(CONNECT_EVENT, (provider) => resolve(provider));
      this.on(ERROR_EVENT, (error) => reject(error));
      this.on(CLOSE_EVENT, () => reject("Modal closed by user"));
      const provider = this.providerController.getProvider(id);
      if (!provider) {
        return reject(
          new Error(
            `Cannot connect to provider (${id}), check provider options`
          )
        );
      }
      const walletWayToConnect =
        provider.walletWaysToConnect.find(
          (walletWayToConnect) => walletWayToConnect.id === connectorId
        ) || provider.walletWaysToConnect[0];

      await this.providerController.connectTo(
        provider.id,
        walletWayToConnect.id,
        walletWayToConnect.connector
      );
    });

  public getInfo = () => {
    const show = this.show;
    const themeConfig = this.themeConfig;
    const options = this.options;

    return {
      show,
      themeConfig,
      options,
    };
  };

  public async updateTheme(
    theme: ThemeNameList | ThemeConfig["theme"]
  ): Promise<void> {
    const themeConfig = getThemeConfig(theme);
    await this.updateState({ themeConfig });
  }

  public on(event: Events, callback: SimpleFunction): SimpleFunction {
    this.eventController.on({
      event,
      callback,
    });

    return () =>
      this.eventController.off({
        event,
        callback,
      });
  }

  public off(event: Events, callback?: SimpleFunction): void {
    this.eventController.off({
      event,
      callback,
    });
  }

  public checkAuth = async (
    providerIdList: string[] | undefined = Object.keys(allProviders.providers)
  ) => {
    const providers = providerIdList?.map(async (id) => {
      const provider = this.providerController.getProvider(id);

      const promises = provider?.walletWaysToConnect
        .filter(({ type }) => type === "extension")
        .map(async ({ authConnector, id: connectorId, type }) => {
          const provider =
            authConnector &&
            (await this.providerController.getAuthTo(
              id,
              connectorId,
              authConnector
            ));

          if (!provider) return null;

          return {
            connectorId,
            connectorType: type,
            provider,
          };
        })
        .filter((promise) => !!promise);

      const providerList = promises && (await Promise.all(promises));

      return {
        id,
        walletWaysToConnect: providerList?.filter((item) => !!item?.provider),
      };
    });

    const authList = await Promise.all(providers);

    const filteredAuthList = authList?.filter(
      ({ walletWaysToConnect }) => !!walletWaysToConnect?.length
    );

    const auth = filteredAuthList?.length ? filteredAuthList : false;

    const authProvider = auth && auth?.[0]?.walletWaysToConnect?.[0]?.provider;

    this.eventController.trigger(CONNECT_EVENT, authProvider);

    return authProvider;
  };

  public get currentProvider() {
    return this.providerController.currentProvider;
  }

  public static getPromise = (
    walletId: string,
    type: string | undefined = "extension"
  ) => getPromiseRaw(window, walletId, type);

  // --------------- PRIVATE METHODS --------------- //

  private checkIsWalletBrowser = () => {
    const isVenomWalletBrowser = !!(
      navigator && navigator.userAgent.includes("VenomWalletBrowser")
    );
    const isEverWalletBrowser = !!(
      navigator && navigator.userAgent.includes("EverWalletBrowser")
    );
    return {
      isVenomWalletBrowser,
      isEverWalletBrowser,
      isOneOfWalletBrowsers: isVenomWalletBrowser || isEverWalletBrowser,
    };
  };

  private async disconnect() {
    try {
      await this.currentProvider?._api?.disconnect?.();
    } catch (error) {}
  }

  private renderModal() {
    const VENOM_CONNECT_MODAL_ID = "VENOM_CONNECT_MODAL_ID";

    const oldContainer = document.getElementById(VENOM_CONNECT_MODAL_ID);

    if (!oldContainer) {
      const el = document.createElement("div");
      el.id = VENOM_CONNECT_MODAL_ID;
      document.body.appendChild(el);
    }

    const container =
      oldContainer || document.getElementById(VENOM_CONNECT_MODAL_ID);

    const root = oldRoot || (oldRoot = createRoot(container!));

    let optionsIds: (string | null)[] = Array.from(
      new Set(this.options.map(({ id }) => id))
    );

    const filteredOptions = this.options.filter(({ id }) => {
      const index = optionsIds.findIndex((optionsId) => optionsId === id);
      if (~index) {
        optionsIds[index] = null;
        return true;
      } else {
        return false;
      }
    });

    const supportedOptions = filteredOptions.filter(
      ({ walletWaysToConnect }) => {
        const booleanArray = walletWaysToConnect.reduce((r, { type }) => {
          let result: boolean;
          if (isMobile) {
            if (isIOS) {
              result = type === "ios";
            } else {
              result = type === "android";
            }
          } else {
            result = type !== "ios" && type !== "android";
          }

          r.push(result);

          return r;
        }, [] as boolean[]);

        return booleanArray.includes(true);
      }
    );

    const injectedLinkOptions = supportedOptions.map((supportedOption) => {
      return {
        ...supportedOption,
        walletWaysToConnect: supportedOption.walletWaysToConnect.map(
          (walletWayToConnect) => {
            const installExtensionLinkRaw =
              walletWayToConnect.options?.["installExtensionLink"];
            const deepLinkRaw = walletWayToConnect.options?.["deepLink"];
            const qrRaw = walletWayToConnect.options?.["qr"];
            const devisesRaw = walletWayToConnect.options?.["devises"];

            const links = supportedOption.links;

            return {
              ...walletWayToConnect,
              options: {
                ...walletWayToConnect.options,
                installExtensionLink:
                  typeof installExtensionLinkRaw === "function"
                    ? installExtensionLinkRaw(links)
                    : installExtensionLinkRaw,
                deepLink:
                  typeof deepLinkRaw === "function"
                    ? deepLinkRaw(links)
                    : deepLinkRaw,
                qr: typeof qrRaw === "function" ? qrRaw(links) : qrRaw,
                devises: devisesRaw?.map?.((devise: any) => {
                  const deviseDeepLinkRaw = devise?.["deepLink"];
                  return {
                    ...devise,
                    deepLink:
                      typeof deviseDeepLinkRaw === "function"
                        ? deviseDeepLinkRaw(links)
                        : deviseDeepLinkRaw,
                  };
                }),
              },
            };
          }
        ),
      };
    });

    root.render(
      <Modal
        themeConfig={this.themeConfig}
        options={injectedLinkOptions}
        onClose={this.onClose}
        changeWallet={async () => {
          await this.disconnect();
          this.connect();
        }}
        disconnect={
          this.checkIsWalletBrowser().isOneOfWalletBrowsers
            ? () => this.disconnect()
            : undefined
        }
      />
    );
  }
  private onError = async (error: any) => {
    if (this.show) {
      await this._toggleModal();
    }
    this.eventController.trigger(ERROR_EVENT, error);
  };

  private onProviderSelect = (providerId: string) => {
    this.eventController.trigger(SELECT_EVENT, providerId);
  };

  private onConnect = async (provider: any) => {
    if (this.show) {
      await this._toggleModal();
    }
    this.eventController.trigger(CONNECT_EVENT, provider);
  };

  private onClose = async () => {
    if (this.show) {
      await this._toggleModal();
    }
    this.eventController.trigger(CLOSE_EVENT);
  };

  private _toggleModal = async () => {
    // const body = document.body;
    // if (body) {
    //   if (this.show) {
    //     body.style.overflow = "initial";

    //     window.scrollTo(0, this.pagePosition || 0);
    //     this.pagePosition = null;
    //   } else {
    //     this.pagePosition = window.scrollY || 0;

    //     body.style.overflow = "hidden";
    //   }
    // }
    await this.updateState({ show: !this.show });
  };

  private updateState = async (state: any) => {
    Object.keys(state).forEach((key) => {
      // @ts-ignore
      this[key] = state[key];
    });
    await window.updateVenomModal(state);
  };
}

export { VenomConnect };
