import { Menu } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { PAGE_CONFIGS } from "../config/routes";

const menuItems = Object.values(PAGE_CONFIGS).map((config) => {
  const Icon = config.icon;
  return {
    key: config.id,
    icon: Icon ? <Icon className="app-tab-icon" /> : null,
    label: config.title,
  };
});

function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab =
    Object.values(PAGE_CONFIGS).find(
      (config) => config.path === location.pathname,
    )?.id || "welcome";

  return (
    <div className="app-tabbar">
      <Menu
        className="app-fixed-menu"
        mode="horizontal"
        selectedKeys={[activeTab]}
        items={menuItems}
        disabledOverflow
        onClick={({ key }) => {
          const config = PAGE_CONFIGS[key];
          if (config) navigate(config.path);
        }}
      />
    </div>
  );
}

export default TabBar;
