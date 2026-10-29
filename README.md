# dsh-profile-switcher

在侧边栏品牌位加一个 `dsh <当前profile> ▾` 触发器（只有 profile 名字部分可点）：列出当前 `$DSH_HOME` 以及同级 `~/.dsh-*` home 下的 profile，点选后启动目标 Harness，并在当前窗口内**全屏内嵌**它的完整界面（租约 webview），左上角可随时返回默认 profile。

## 交互

1. 点品牌位里的 profile 名（例如 `desktop ▾`，`dsh` 本身不可点）→ 列表（按 home 分组）。
2. 点选一个 profile → 菜单关闭，立即全屏显示「正在启动 …」。
3. 目标服务器就绪后，租约 webview 接管全屏区域；顶部标题栏行（与红绿灯同级）左侧是「返回默认配置」，右侧是「在新标签页打开」。
4. 返回时销毁 guest、释放租约，并**停止该 profile 的服务器进程**；再次选择会重新启动。
5. 「在新标签页打开」使用系统浏览器；若随后返回，服务器会被停止，标签页会断开。

## 为什么是租约 webview

桌面主进程的 `will-attach-webview` 只放行 `dshDesktop.browser.acquire()` 发放的租约（`about:blank#<lease>` + 对应 partition），裸 `<webview>` 会被拒绝。插件因此使用 preload 暴露的官方浏览器 guest 通道；导航白名单允许其他端口上的 Harness（目标 profile 服务器）。

## 组成

- `index.js`：Host 半。发现当前 home 与 `~/.dsh-*`，按需用安装自带 dsh CLI 以目标 home 为 `DSH_HOME` 启动 `--profile <name> --no-open --port 0`，解析 `dsh web:` URL，提供 `/api/profile-switcher/{list,open,status,stop}`。
- `client.js`：Client 半。品牌位触发器、锚定列表、全屏 loading/错误态、租约 webview 生命周期、返回与降级。
- `locale/*.json`：插件管理器显示名称与说明。
- `docs/embed-switch-plan.md` / `docs/mockup.png`：方案与 UI 示意。

## 限制

- 侧栏收成 rail 时品牌位不渲染，需要先展开侧栏。
- guest 没有 desktop preload，目录选择器等桌面专属能力会降级为 Web 行为；里层是目标 profile 的完整 UI（含它自己的侧栏/主题）。
- 非桌面（`dsh web`）没有 `dshDesktop.browser`，会退化为新标签页打开。
- 电子层 `loadURL` 的 `ERR_ABORTED (-3)` 是 token 跳转过程中的预期中断，按浏览器面板的做法忽略；真正失败才会显示错误卡片。
- 目标 profile 需包含 `@deepseek-ai/dsh-web-app`；第三方插件依赖 `@deepseek-ai/*` peer 时需要装进该 profile。

## 安装 / 回滚

```bash
dsh plugin --profile desktop add /path/to/plugins/dsh-profile-switcher
```

回滚：`plugin_manager` 禁用/卸载该 bundle；或移除 `sidebar.brand.name` 注册。
