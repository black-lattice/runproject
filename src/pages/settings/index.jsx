import { useSearchParams } from "react-router-dom";
import { McpSettings } from "./coms/McpSettings";
import PageHeading from "@/components/PageHeading";
import { Terminal, Info, PlugZap } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

import { TerminalSettings } from "./coms/TerminalSettings";
import { AboutSettings } from "./coms/AboutSettings";

const NAV_ITEMS = [
  { id: "mcp", label: "MCP 服务", icon: PlugZap, component: McpSettings },
  {
    id: "terminal",
    label: "终端设置",
    icon: Terminal,
    component: TerminalSettings,
  },
  { id: "about", label: "关于", icon: Info, component: AboutSettings },
];

function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const activeSection = params.get("section") || "terminal";
  const setActiveSection = (section) => setParams({ section });

  const ActiveComponent =
    NAV_ITEMS.find((item) => item.id === activeSection)?.component ||
    TerminalSettings;

  return (
    <div className="settings-page h-full flex flex-col">
      <PageHeading
        title="设置"
        description="管理 MCP 连接、终端偏好与应用信息"
      />
      <div className="flex flex-1 min-h-0">
        {/* Sidebar Navigation */}
        <aside className="settings-sidebar w-64 border-r flex flex-col">
          <ScrollArea className="flex-1 py-4">
            <nav className="space-y-1 px-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    aria-current={
                      activeSection === item.id ? "page" : undefined
                    }
                    onClick={() => setActiveSection(item.id)}
                    className={`settings-nav-item w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                      activeSection === item.id
                        ? "settings-nav-item-active"
                        : ""
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${activeSection === item.id ? "text-primary" : "text-muted-foreground"}`}
                    />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </ScrollArea>
        </aside>

        {/* Main Content Area */}
        <main className="settings-content flex-1 flex flex-col min-w-0 overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="settings-content-inner w-full">
              <div className="mb-6">
                <h2 className="section-title">
                  {NAV_ITEMS.find((item) => item.id === activeSection)?.label}
                </h2>
              </div>
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <ActiveComponent />
              </div>
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}

export default SettingsPage;
