import { useLayoutEffect, useState } from "react";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { invoke, isTauri } from "@tauri-apps/api/core";

// Read the CSS roles so native controls, Tailwind and Ant portals stay in sync.
function readTheme(isDark) {
  const styles = getComputedStyle(document.documentElement);
  const color = (name) => `hsl(${styles.getPropertyValue(`--${name}`).trim()})`;
  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
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
  const [appTheme, setAppTheme] = useState({});
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      document.documentElement.classList.toggle("dark", media.matches);
      setAppTheme(readTheme(media.matches));
      if (isTauri()) {
        invoke("set_tray_theme", {
          theme: media.matches ? "dark" : "light",
        }).catch((error) => console.error("同步菜单栏图标主题失败:", error));
      }
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return (
    <ConfigProvider locale={zhCN} theme={appTheme}>
      {children}
    </ConfigProvider>
  );
}
