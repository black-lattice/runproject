import {
  CheckSquareOutlined,
  FolderOpenOutlined,
  SettingOutlined,
  WindowsOutlined,
} from "@ant-design/icons";

export const PAGE_CONFIGS = {
  projects: {
    id: "projects",
    path: "/projects",
    title: "项目管理",
    icon: FolderOpenOutlined,
    closable: false,
    fixed: true,
  },
  terminal: {
    id: "terminal",
    path: "/terminal",
    title: "终端",
    icon: WindowsOutlined,
    closable: false,
    fixed: true,
  },
  welcome: {
    id: "welcome",
    path: "/welcome",
    title: "任务",
    icon: CheckSquareOutlined,
    closable: false,
    fixed: true,
  },
  settings: {
    id: "settings",
    path: "/settings",
    title: "设置",
    icon: SettingOutlined,
    closable: false,
    fixed: true,
  },
};
