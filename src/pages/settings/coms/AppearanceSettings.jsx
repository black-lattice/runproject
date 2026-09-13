import { Alert, Radio } from "antd";
import { Monitor, Moon, Sun } from "lucide-react";
import { useAppAppearance } from "@/components/AppTheme";

const options = [
  { value: "system", label: "跟随系统", Icon: Monitor },
  { value: "light", label: "浅色", Icon: Sun },
  { value: "dark", label: "深色", Icon: Moon },
];
export function AppearanceSettings() {
  const { preference, isDark, setPreference, saveError } = useAppAppearance();
  return (
    <div className="space-y-4">
      <section className="settings-section" aria-label="外观偏好">
        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <h3 className="text-sm font-medium" id="appearance-theme-label">
              界面主题
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              选择适合你的外观，所有页面立即同步。
            </p>
          </div>
          <Radio.Group
            aria-labelledby="appearance-theme-label"
            value={preference}
            onChange={(event) => setPreference(event.target.value)}
            optionType="button"
            buttonStyle="solid"
            className="flex flex-wrap gap-y-2"
            options={options.map(({ value, label, Icon }) => ({
              value,
              label: (
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </span>
              ),
            }))}
          />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            当前为{isDark ? "深色" : "浅色"}外观。
            {preference === "system"
              ? "随系统外观自动切换。"
              : "此选择仅用于 RunProject。"}
            偏好会保存在本机。
          </p>
        </div>
      </section>
      {saveError && <Alert type="warning" showIcon title={saveError} />}
    </div>
  );
}
