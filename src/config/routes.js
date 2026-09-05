import {
  CodeOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  SettingOutlined,
  WindowsOutlined,
} from "@ant-design/icons";

export const PAGE_CONFIGS = {
  welcome: {
    id: "welcome",
    path: "/welcome",
    title: "首页",
    icon: HomeOutlined,
    closable: false,
    fixed: true, // 标记为固定在左侧
  },
  projects: {
    id: "projects",
    path: "/projects",
    title: "项目管理",
    icon: FolderOpenOutlined,
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
  terminal: {
    id: "terminal",
    path: "/terminal",
    title: "终端",
    icon: WindowsOutlined,
    closable: false,
    fixed: true,
  },
  formatter: {
    id: "formatter",
    path: "/formatter",
    title: "数据格式化",
    icon: CodeOutlined,
    closable: false,
    fixed: true,
  },
};
