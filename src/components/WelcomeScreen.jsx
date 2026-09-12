import { Button } from "@/components/ui/button";
import { FolderPlus } from "lucide-react";
import PageEmptyState from "./PageEmptyState";

const steps = [
  ["添加工作区", "选择项目所在文件夹，自动发现 Node.js 项目。"],
  ["选择项目", "在侧栏查看项目，管理分支与运行环境。"],
  ["运行脚本", "一键执行命令，在终端中查看运行日志。"],
];

export default function WelcomeScreen({ onAddWorkspace }) {
  return (
    <div className="project-onboarding">
      <PageEmptyState
        icon={FolderPlus}
        title="从一个工作区开始"
        description="把项目集中在这里，轻松切换环境、运行脚本。"
      >
        <Button onClick={onAddWorkspace}>
          <FolderPlus className="h-4 w-4" />
          添加工作区
        </Button>
      </PageEmptyState>
      <ol className="project-onboarding-steps">
        {steps.map(([title, description], index) => (
          <li key={title}>
            <span className="project-step-number">0{index + 1}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </li>
        ))}
      </ol>
      <p className="project-onboarding-shortcut">
        <kbd>⌘ / Ctrl + Shift + O</kbd> 快速添加工作区
      </p>
    </div>
  );
}
