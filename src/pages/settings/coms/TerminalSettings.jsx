import { useAppStore } from "@/store/useAppStore";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TerminalSettings() {
  const { useKittenRemote, setUseKittenRemote, terminalType, setTerminalType } =
    useAppStore();

  return (
    <section className="settings-section" aria-label="终端偏好">
      <div className="settings-rows">
        <div className="settings-row">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="terminal-type" className="text-sm font-medium">
              终端类型
            </Label>
            <p className="text-sm text-muted-foreground">
              选择命令执行使用的终端类型
            </p>
          </div>
          <Select value={terminalType} onValueChange={setTerminalType}>
            <SelectTrigger id="terminal-type" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="builtin">内置终端 (推荐)</SelectItem>
              <SelectItem value="kitty">Kitty 终端</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {terminalType === "kitty" && (
          <div className="settings-row">
            <div className="space-y-0.5">
              <Label htmlFor="kitten-remote" className="text-sm font-medium">
                使用 Kitty 远程控制
              </Label>
              <p className="text-sm text-muted-foreground">
                启用后使用 kitten @ 命令控制 Kitty
              </p>
            </div>
            <Switch
              id="kitten-remote"
              checked={useKittenRemote}
              onCheckedChange={setUseKittenRemote}
            />
          </div>
        )}
      </div>
    </section>
  );
}
