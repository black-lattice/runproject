import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import AppLogo from "@/components/AppLogo";
import { version } from "../../../../package.json";

export function AboutSettings() {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const showUpdater =
    import.meta.env.PROD && isTauri() && /Mac/.test(navigator.platform);

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      await invoke("check_for_updates");
    } catch (error) {
      toast({
        title: "无法检查更新",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="settings-section" aria-label="应用信息">
      <div className="about-brand">
        <AppLogo className="h-12 w-12 shrink-0" />
        <div>
          <h3 className="section-title">RunProject</h3>
          <p className="text-sm text-muted-foreground">
            Node.js 项目工作区管理器
          </p>
        </div>
      </div>
      <dl className="about-facts">
        <div>
          <dt>应用版本</dt>
          <dd className="flex items-center gap-3">
            {version}
            {showUpdater && (
              <Button
                variant="outline"
                size="sm"
                disabled={checking}
                onClick={checkForUpdates}
              >
                检查更新
              </Button>
            )}
          </dd>
        </div>
        <div>
          <dt>构建技术</dt>
          <dd>Tauri · React</dd>
        </div>
      </dl>
    </section>
  );
}
