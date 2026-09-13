import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  APPEARANCE_STORAGE_KEY,
  normalizeAppearance,
  readAppearance,
  isDarkAppearance,
} from "@/utils/appearance";

const AppearanceContext = createContext(null);
export const useAppAppearance = () => useContext(AppearanceContext);

// Read the CSS roles so native controls, Tailwind and Ant portals stay in sync.
function readTheme(isDark) {
  const styles = getComputedStyle(document.documentElement);
  const color = (name) => `hsl(${styles.getPropertyValue(`--${name}`).trim()})`;
  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    // Ant defaults these solid primary controls to light text. Our dark palette
    // uses a light blue primary surface, whose matching foreground is dark.
    components: {
      Radio: { buttonSolidCheckedColor: color("primary-foreground") },
      Button: { primaryColor: color("primary-foreground") },
    },
    token: {
      colorPrimary: color("primary"),
      colorInfo: color("primary"),
      colorSuccess: color("success"),
      colorWarning: color("warning"),
      colorError: color("destructive"),
      colorBgBase: color("background"),
      colorBgLayout: color("background"),
      colorBgContainer: color("card"),
      colorBgElevated: color("popover"),
      colorText: color("foreground"),
      colorTextSecondary: color("muted-foreground"),
      colorTextPlaceholder: color("muted-foreground"),
      colorBorder: color("input"),
      colorBorderSecondary: color("border"),
      colorFillTertiary: color("muted"),
      colorPrimaryBg: color("accent"),
      fontFamily: styles.getPropertyValue("--font-sans").trim(),
      fontSize: 14,
      fontSizeSM: 12,
      fontWeightStrong: 600,
      lineHeight: 1.6,
      borderRadius: 8,
      controlHeight: 36,
      controlHeightSM: 32,
      boxShadow: styles.getPropertyValue("--shadow-popover").trim(),
      boxShadowSecondary: styles.getPropertyValue("--shadow-popover").trim(),
    },
  };
}

export default function AppTheme({ children }) {
  const [preference, setStoredPreference] = useState(() => {
    try {
      return readAppearance(window.localStorage);
    } catch {
      return "system";
    }
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [saveError, setSaveError] = useState("");
  const [appTheme, setAppTheme] = useState({});
  const isDark = isDarkAppearance(preference, systemDark);
  const setPreference = useCallback((value) => {
    const next = normalizeAppearance(value);
    setStoredPreference(next);
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, next);
      setSaveError("");
    } catch {
      setSaveError("本次外观已生效，但无法保存到本机。重新打开后会恢复上次保存的外观。");
    }
  }, []);
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystem = () => setSystemDark(media.matches);
    const syncStorage = (event) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) {
        setStoredPreference(normalizeAppearance(event.newValue));
        setSaveError("");
      }
    };
    syncSystem();
    media.addEventListener("change", syncSystem);
    window.addEventListener("storage", syncStorage);
    return () => {
      media.removeEventListener("change", syncSystem);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    setAppTheme(readTheme(isDark));
  }, [isDark]);
  return (
    <AppearanceContext.Provider
      value={{ preference, isDark, setPreference, saveError }}
    >
      <ConfigProvider locale={zhCN} theme={appTheme}>
        {children}
      </ConfigProvider>
    </AppearanceContext.Provider>
  );
}
