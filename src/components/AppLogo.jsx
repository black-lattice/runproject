import logoDark from "@/assets/logo/moon-logo-dark-512.png";
import logoLight from "@/assets/logo/moon-logo-light-512.png";
import { useAppAppearance } from "./AppTheme";

function AppLogo({ className = "" }) {
  const { isDark } = useAppAppearance();
  return (
    <picture className={className}>
      <img
        src={isDark ? logoDark : logoLight}
        alt="RunProject"
        className="h-full w-full rounded-md object-cover"
        draggable="false"
      />
    </picture>
  );
}

export default AppLogo;
