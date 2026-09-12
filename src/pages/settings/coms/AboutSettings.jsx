import AppLogo from "@/components/AppLogo";
import { version } from "../../../../package.json";

export function AboutSettings() {
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
          <dd>{version}</dd>
        </div>
        <div>
          <dt>构建技术</dt>
          <dd>Tauri · React</dd>
        </div>
      </dl>
    </section>
  );
}
