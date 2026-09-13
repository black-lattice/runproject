# 图标维护

运行 `pnpm icons` 重新生成桌面 PNG、ICNS、ICO 和菜单栏 PNG，随后运行 `pnpm tauri build --bundles app` 打包 macOS 应用。

- 应用图标保留 `src/assets/logo/moon-logo-dark-512.png` 的原始图案。生成脚本在 1024 × 1024 画布内将其放入 824 × 824 的圆角区域，四周各留 100 像素透明边距，圆角半径为 185。不要再直接将原始直角图片写入 ICNS。
- 菜单栏源文件为 `src/assets/logo/tray-template.svg`，使用适合 18 pt 显示的简化月亮、星星和圆角轮廓，输出 36 × 36 的 Retina 资源。macOS 使用原生模板模式，根据菜单栏背景和选中状态着色；Windows/Linux 使用彩色应用图标。
- 生成的资源随源码保存，正常构建无需再次生成，也不依赖图像生成服务。最终打包保留原始品牌图案，未使用生成式图片草稿。
- 必须退出旧进程并打开新构建的应用才能看到菜单栏更新；若使用安装版，需要替换对应的 `.app`。

参考：[Tauri 托盘 API](https://v2.tauri.app/reference/javascript/api/namespacetray/)、[Apple 应用图标设计](https://developer.apple.com/design/human-interface-guidelines/app-icons)。
