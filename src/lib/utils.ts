import { Injector, common, util, webpack } from "replugged";
import { SettingValues, isUpdatingStatus, lodash } from "../index";
import {
  AccountDetails,
  AccountDetailsClasses,
  MediaEngineActions,
  NotificationSettingsStore,
  SoundUtils,
} from "./requiredModules";
import { Sounds, defaultSettings } from "./consts";
import * as Types from "../types";
const PluginInjector = new Injector();
const { React, fluxDispatcher: FluxDispatcher } = common;

export const filterOutObjectKey = (object: object, keys: string[]): object =>
  Object.keys(object)
    .filter((key) => !keys.includes(key))
    .reduce((obj, key) => {
      obj[key] = object[key];
      return obj;
    }, {});

export const findInTree = (
  tree: object,
  searchFilter: Types.DefaultTypes.AnyFunction,
  searchOptions: { ignore?: string[]; walkable?: null | string[] },
): unknown => {
  const { walkable = null, ignore = [] } = searchOptions;
  if (typeof searchFilter === "string") {
    if (Object.hasOwnProperty.call(tree, searchFilter)) return tree[searchFilter];
  } else if (searchFilter(tree)) {
    return tree;
  }
  if (typeof tree !== "object" || tree == null) return;

  let tempReturn: unknown;
  if (Array.isArray(tree)) {
    for (const value of tree) {
      tempReturn = findInTree(value, searchFilter, { walkable, ignore });
      if (typeof tempReturn !== "undefined") return tempReturn;
    }
  } else {
    const toWalk = walkable == null ? Object.keys(tree) : walkable;
    for (const key of toWalk) {
      if (!Object.hasOwnProperty.call(tree, key) || ignore.includes(key)) continue;
      tempReturn = findInTree(tree[key], searchFilter, { walkable, ignore });
      if (typeof tempReturn !== "undefined") return tempReturn;
    }
  }
  return tempReturn;
};

export const findInReactTree = (
  tree: Types.ReactElement,
  searchFilter: Types.DefaultTypes.AnyFunction,
): unknown | Types.ReactElement => {
  return findInTree(tree, searchFilter, { walkable: ["props", "children", "child", "sibling"] });
};

export const isObject = (testMaterial: unknown): boolean =>
  typeof testMaterial === "object" && !Array.isArray(testMaterial) && testMaterial != null;

export const hasProps = (mod: object, props: string[] | unknown[]): boolean =>
  isObject(mod) && props.every((prop: string | unknown) => Object.hasOwnProperty.call(mod, prop));

export const stringify = (component: Types.ReactElement): string =>
  JSON.stringify(component, (_, symbol) =>
    typeof symbol === "symbol" ? `$$Symbol:${Symbol.keyFor(symbol)}` : symbol,
  );

export const prase = (component: string): Types.ReactElement =>
  JSON.parse(component, (_, symbol) => {
    const matches = symbol?.match?.(/^\$\$Symbol:(.*)$/);
    return matches ? Symbol.for(matches[1]) : symbol;
  });
export const deepCloneReactComponent = (component: Types.ReactElement): Types.ReactElement =>
  prase(stringify(component));

export const addStyle = (
  component: Types.ReactElement,
  style: object,
): Types.ReactElement | undefined => {
  if (!component || !style) return;
  component = React.cloneElement(component);
  component.props.style = component.props.style ? { ...component.props.style, ...style } : style;
  return component;
};

export const addChilds = (
  component: Types.ReactElement,
  childrens: Types.ReactElement[] | Types.ReactElement,
): Types.ReactElement | undefined => {
  if (!component || !childrens) return;
  component = React.cloneElement(component);
  if (!Array.isArray(component.props.children))
    component.props.children = [component.props.children];
  else
    component.props.children = component.props.children.map(
      (m: Types.ReactElement): Types.ReactElement => React.cloneElement(m),
    );
  if (Array.isArray(childrens)) component.props.children.push(...childrens);
  else component.props.children.push(childrens);
  return component;
};

export const prototypeChecker = (
  ModuleExports: Types.DefaultTypes.ModuleExports,
  Protos: string[],
): boolean =>
  isObject(ModuleExports) &&
  Protos.every((p) =>
    Object.values(ModuleExports).some((m) => (m as { prototype: () => void })?.prototype?.[p]),
  );
export const forceUpdate = (element: HTMLElement): void => {
  if (!element) return;
  const toForceUpdate = util.getOwnerInstance(element);
  const forceRerender = PluginInjector.instead(toForceUpdate, "render", () => {
    forceRerender();
    return null;
  });
  toForceUpdate.forceUpdate(() => toForceUpdate.forceUpdate(() => {}));
};
export const forceLoadAndGetKeybindRecorder = async (): Promise<Types.ComponentClass> => {
  const KeybindRecorder = webpack.getModule((m) =>
    prototypeChecker(m?.exports, ["handleComboChange", "cleanUp"]),
  ) as unknown as Types.ComponentClass;
  if (KeybindRecorder) return KeybindRecorder;
  const unpatchAfterLoad = PluginInjector.after(
    AccountDetails.prototype,
    "render",
    (
      _args,
      res,
      instance: {
        handleOpenSettings: Types.DefaultTypes.AnyFunction;
      },
    ) => {
      unpatchAfterLoad();
      instance?.handleOpenSettings();
      util
        .sleep(0)
        .then(() => {
          FluxDispatcher.dispatch({ type: "LAYER_POP_ALL" });
        })
        .catch(() => {});
      return res;
    },
  );
  const AccountDetailsElement = await util.waitFor(`.container-YkUktl:not(.spotify-modal)`);
  forceUpdate(AccountDetailsElement as HTMLElement);
  return webpack.getModule((m) =>
    prototypeChecker(m?.exports, ["handleComboChange", "cleanUp"]),
  ) as unknown as Types.ComponentClass;
};
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
export const waitForUpdate = new Promise<void>((resolve) => {
  const checkUpdateing = (): void => {
    if (!isUpdatingStatus?.size) {
      resolve();
    } else setTimeout(checkUpdateing, 100);
  };
  checkUpdateing();
});
export const updateSoundStatus = async (): Promise<void> => {
  await waitForUpdate;
  isUpdatingStatus.add(isUpdatingStatus?.size + 1);
  const { state: NotificationSettingsState } = NotificationSettingsStore.__getLocalVars();
  const toToggle = ["mute", "unmute"].filter(
    (m: string): boolean => !NotificationSettingsStore.isSoundDisabled(m),
  );
  NotificationSettingsState.disabledSounds.push(...toToggle);
  await MediaEngineActions.toggleSelfMute();
  await sleep(100);
  await MediaEngineActions.toggleSelfMute();
  NotificationSettingsState.disabledSounds = NotificationSettingsState.disabledSounds.filter(
    (m: string): boolean => !toToggle.includes(m),
  );
  isUpdatingStatus.clear();
};
export const toggleSoundStatus = (enabled: boolean): void => {
  if (SettingValues.get("playAudio", defaultSettings.playAudio))
    SoundUtils.playSound(enabled ? Sounds.Disable : Sounds.Enable, 0.5);
  SettingValues.set("enabled", !enabled);
  if (SettingValues.get("userPanel", defaultSettings.userPanel))
    forceUpdate(document.querySelector(`.${AccountDetailsClasses.container}:not(.spotify-modal)`));
};
export const useSetting = (
  settingsManager: typeof SettingValues,
  path: string,
  defaultValue?: string | boolean,
  options?: { clearable?: boolean },
): {
  value: string | boolean;
  onChange: (newValue: string | { value: string }) => void;
  onClear?: () => void;
} => {
  const { clearable = false } = options ?? {};
  const [key, ...realPath] = path.split(".");
  const realPathJoined = realPath.join(".");
  const setting = settingsManager.get(key as keyof Types.Settings);
  const initial = realPath.length
    ? lodash.get(setting, realPathJoined, defaultValue)
    : (setting as string);
  const [value, setValue] = React.useState(initial);

  return {
    value,
    onClear: clearable
      ? () => {
          setValue("");
          const changed = realPath.length
            ? lodash.set(setting as object, realPathJoined, "")
            : ("" as never);
          settingsManager.set(key as keyof Types.Settings, changed);
        }
      : () => null,
    onChange: (newValue) => {
      if (typeof newValue == "object" && Object.hasOwnProperty.call(newValue, "value"))
        newValue = newValue.value;
      setValue(newValue as unknown as string);
      const changed = realPath.length
        ? lodash.set(setting as object, realPathJoined, newValue)
        : (newValue as never);
      settingsManager.set(key as keyof Types.Settings, changed);
    },
  };
};
