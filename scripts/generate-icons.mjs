import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "runproject-icons-"));
const generate = (source, output, extra = []) =>
  execFileSync("pnpm", ["exec", "tauri", "icon", source, "--output", output, ...extra], {
    cwd: root,
    stdio: "inherit",
  });

try {
  // Keep the original artwork intact. ICNS needs its own transparent margins
  // and rounded silhouette; the Dock does not apply a mask to this PNG.
  const artwork = readFileSync(join(root, "src/assets/logo/moon-logo-dark-512.png")).toString("base64");
  const source = join(temporary, "app.svg");
  writeFileSync(source, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><clipPath id="tile"><rect x="100" y="100" width="824" height="824" rx="185"/></clipPath></defs>
  <image x="100" y="100" width="824" height="824" clip-path="url(#tile)" xlink:href="data:image/png;base64,${artwork}"/>
</svg>`);
  const desktop = join(temporary, "desktop");
  generate(source, desktop);
  // Only ship desktop assets; Tauri also generates mobile assets by default.
  const names = ["icon.png", "icon.icns", "icon.ico", "32x32.png", "128x128.png", "128x128@2x.png",
    "Square30x30Logo.png", "Square44x44Logo.png", "Square71x71Logo.png", "Square89x89Logo.png",
    "Square107x107Logo.png", "Square142x142Logo.png", "Square150x150Logo.png", "Square284x284Logo.png",
    "Square310x310Logo.png", "StoreLogo.png"];
  for (const name of names) copyFileSync(join(desktop, name), join(root, "src-tauri/icons", name));

  const tray = join(temporary, "tray");
  generate(join(root, "src/assets/logo/tray-template.svg"), tray, ["--png", "36"]);
  copyFileSync(join(tray, "36x36.png"), join(root, "src-tauri/icons/tray-template.png"));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
