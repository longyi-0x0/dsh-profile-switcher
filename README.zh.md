# dsh-profile-switcher

[![CI](https://github.com/longyi-0x0/dsh-profile-switcher/actions/workflows/ci.yml/badge.svg)](https://github.com/longyi-0x0/dsh-profile-switcher/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

在 DeepSeek Harness 侧边栏切换配置（profile），并把另一个配置的完整 Web UI
**内嵌到当前窗口**，无需刷新、不会丢失宿主会话。

[English](README.md) | 中文

![UI 设计稿](https://raw.githubusercontent.com/longyi-0x0/dsh-profile-switcher/main/docs/design/mockup.png)

> 上图为设计稿，不是截图；正式发布前请替换为真实截图。

## 为什么需要它

Desktop 主进程只启动一个写死的 profile。要使用另一个 profile，只能另开标签页、另开窗口、
重新认证。本插件按需启动目标 profile（`dsh --profile <name> --no-open --port 0`），
取得它的认证 URL，再通过 Desktop 的租约 webview 全屏内嵌，左上角一键返回。

- 侧边栏品牌位显示「官方 wordmark + 当前配置」。
- 按 DSH home 分组列出配置（`~/.dsh`、`~/.dsh-trading` 等）。
- 点选后目标 Harness 自动启动，就绪后全屏接管。
- 返回时立即停止目标服务器；无人使用时会自动回收。
- 纯浏览器环境（无 Desktop preload）自动退化为系统浏览器打开。
- 可直接在菜单里新建与删除配置；新建的是能立刻打开的 Web 配置。

## 环境要求

| 要求                   | 说明                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| DeepSeek Harness 0.2.x | 已在 Desktop/runtime `0.2.1-rc.5` 验证；依赖认证路由注册表 `ctx.connection.fetch`。                                  |
| Desktop 应用           | 全屏内嵌依赖 Desktop 浏览器租约桥；`dsh web` 退化为系统浏览器。                                                      |
| Node.js ≥ 20           | 仅在通过 `PATH` 启动 `dsh` 时需要。                                                                                  |
| 原生窗口（可选）       | `cargo install --path native-window` 或 `config.windowShell`；使用系统 WebView（WKWebView / WebView2 / WebKitGTK）。 |
| 目标配置               | 必须包含 `@deepseek-ai/dsh-web-app`；其第三方插件的 peer 依赖需装进该 profile。                                      |

## 安装

### GitHub

```bash
dsh plugin --profile desktop add github:longyi-0x0/dsh-profile-switcher
```

### 本地目录

```bash
pnpm install
pnpm build              # 生成并提交到 lib/ 的构建产物
dsh plugin --profile desktop add /absolute/path/to/dsh-profile-switcher
```

`link:` 安装直接使用目录内容，因此安装前或改源码后必须先 `pnpm build`。

### npm

包已具备发布条件，但尚未发布到 npm；首个 npm 版本发布前请使用 GitHub 或本地目录安装：

```bash
dsh plugin --profile desktop add dsh-profile-switcher
```

## 使用

1. 点击侧边栏品牌位中的配置按钮。
2. 选择一个配置（当前配置禁用，运行中的配置有标记）。
3. 菜单关闭，目标全屏启动。
4. 就绪后目标 UI 接管；顶栏保留「返回默认配置」和「在浏览器打开」。
5. 点击「返回」会销毁 guest、释放租约并停止目标服务器。

### 新建与删除配置

- 菜单底部的「新建配置」弹出一个居中的对话框。新配置是当前 home 下的 Web 配置
  （`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`），建完即可打开；要给它装
  插件用 `dsh plugin --profile <名> add <包>`。
- 每一行的删除按钮先进入确认态，再点一次才删除；删除会把该配置里已装的插件一起删掉。
  当前配置与应用托管的 `desktop` 配置不提供删除操作。
- 「在新窗口打开」把目标放进一个**原生应用窗口**：`native-window/` 是一个 tao + wry 写的
  小程序（`dsh-profile-window`），一窗一个 WebView，不是浏览器标签页。它是可选的——用
  `cargo install --path native-window` 装一次（把 `dsh-profile-window` 放进 `PATH`），
  或用 `config.windowShell` 指定路径；没有窗口组件时按钮不显示。组件启动失败时改为在
  浏览器打开，并在顶栏提示。
- 「在浏览器打开」是普通交接：桌面壳把 `window.open` 转成 `shell.openExternal`，是标签页
  还是新窗口由浏览器决定。

如果菜单提示找不到 dsh 启动器，请设置 `config.dshPath` 或把 `dsh` 放进 `PATH`。
未认证或跨站请求会被平台 `/api` 的 Host/Origin fence 以 401/403 拒绝。

## 配置

在 profile patch 的插件行上增加 `config`：

```yaml
- insert:
    - id: profile-switcher
      name: dsh-profile-switcher
      config:
        idleStopMs: 900000
        maxRunning: 3
```

| 字段                   | 默认值   | 说明                                                                     |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| `additionalHomes`      | `[]`     | 额外 home，与当前 home、`~/.dsh-*` 同级 home 一同列出。                  |
| `discoverSiblingHomes` | `true`   | 是否扫描 `~/.dsh-*` / `~/.dsh_*`。                                       |
| `launcher`             | `auto`   | `auto` / `desktop-cli` / `path`；auto 优先 Desktop 自带 CLI，其次 PATH。 |
| `dshPath`              | 无       | 显式 CLI 路径，关闭自动发现。                                            |
| `windowShell`          | 无       | `dsh-profile-window` 的路径；留空则在 `PATH` 与包内构建产物中查找。      |
| `startTimeoutMs`       | `120000` | 目标打印 URL 的最长等待（5s–600s）。                                     |
| `idleStopMs`           | `900000` | 无心跳后停止目标服务器（60s–24h）；`0` 关闭。                            |
| `maxRunning`           | `3`      | 同时运行的目标服务器上限（1–10）。                                       |
| `killGraceMs`          | `5000`   | SIGTERM 到 SIGKILL 的宽限期（100ms–60s）。                               |
| `logLevel`             | `warn`   | `debug` / `info` / `warn` / `error`。                                    |

非法值会写入插件日志并回退默认值，不会因为配置笔误导致侧边栏不可用。

## 安全

- 所有路由都挂在平台已认证的 `/api` 通道上：需要 owner 浏览器会话，Host/Origin fence
  会拒绝跨站与 DNS rebinding（401/403）。
- 启动 URL 携带目标 profile 的 bearer token；只存在于内存，只由 `/status` 返回给已认证
  owner，绝不写入日志、`/list` 或 DOM 属性。
- 唯一可启动的对象是解析出的 `dsh` 可执行文件，配置名经过校验，home 必须来自允许列表；
  请求无法传入任意命令或路径。
- guest 是租约 webview 中的外部来源，Desktop 主进程只放行自己签发的租约；插件不会向
  guest 注入代码。

完整威胁模型见 [docs/security-model.md](docs/security-model.md)。

## 兼容性与已知限制

- 依赖 `ctx.connection.fetch`；不支持缺少该注册表的旧版 DSH，插件会打印明确诊断。
- 全屏内嵌仅限 Desktop；`dsh web` 会在系统浏览器打开目标。
- 删除配置不可撤销，会连同该配置里已装的插件一起删除；菜单需要二次点击确认。
- 新建的配置不含第三方插件，需要 `dsh plugin` 另行安装。
- 侧边栏收起为 rail 时不渲染品牌位，需要先展开。
- guest 没有 Desktop preload，依赖桌面能力的操作在 guest 内退化为 Web 行为。
- 一个页面持有一个目标服务器；两个窗口打开同一配置时，任一窗口返回都会停止服务器。
- 系统睡眠超过 `idleStopMs` 可能停止仍在屏幕上的服务器；错误卡片提供重试。
- token URL 跳转期间的 `ERR_ABORTED (-3)` 属正常现象，会被忽略。
- 当前配置通过 `DSH_PROFILE`、`DSH_PROFILE_DIR`、`--profile` 或 Desktop argv 推断；
  推断失败时菜单仍可用，只是不标记当前项。

## 故障排查

| 现象                         | 处理                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 提示找不到启动器             | 设置 `config.dshPath`，或把 `dsh` 安装到 `PATH`。Desktop 会自动发现自带 CLI。                       |
| 控制台 401 / 会话失效        | 刷新 Harness 页面；路由需要浏览器会话 cookie。                                                      |
| 提示当前 Harness 版本不支持  | 升级到带 `ctx.connection.fetch` 的 0.2.x。                                                          |
| 目标启动后立即退出           | 直接在终端运行 `dsh --profile <name>` 查看它的启动错误，常见原因是缺少 `dsh-web-app` 或 peer 依赖。 |
| 挂着窗口一段时间后服务器消失 | 已超过 `idleStopMs` 无心跳；重新打开，或增大/关闭空闲回收。                                         |
| 内嵌页显示登录或连接错误     | 目标 profile 自身的服务器拒绝会话；查看其日志。                                                     |

需要生命周期诊断时设置 `logLevel: debug`；日志中的启动 URL 会被脱敏。

## 开发

```bash
pnpm install
pnpm check          # typecheck + lint + tests + build + artifact smoke + package check
pnpm dev            # 监听源码并重建 lib/
```

| 脚本                              | 作用                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| `pnpm build`                      | 打包 `src/host` → `lib/index.js`、`src/client` → `lib/client.js`。      |
| `pnpm typecheck`                  | Host（Node）与 Client（DOM）分别类型检查。                              |
| `pnpm lint` / `pnpm format:check` | ESLint（hooks / jsx-a11y）与 Prettier。                                 |
| `pnpm test`                       | Vitest：Host 单测 + Client jsdom 测试。                                 |
| `pnpm smoke`                      | 在 VM 中加载真实 client 产物，执行 `apply`，校验 loader id 与注册。     |
| `pnpm check:package`              | 校验 manifest、exports、发布文件、patch 行、locale、图标与 wrapper id。 |

`lib/` 产物提交进仓库，保证 `link:`、GitHub、npm 三种安装方式都能直接使用；CI 会重建并
在产物过期时失败。改动 DSH 内部契约时必须同步
[docs/integration-contracts.md](docs/integration-contracts.md)。

桌面端手工验证见 [docs/verification.md](docs/verification.md)（CI 无法驱动 Electron webview）。

## 卸载与回滚

```bash
dsh plugin --profile desktop remove dsh-profile-switcher
```

或在 Plugin Manager 中禁用 bundle。插件不持久化状态、不修改 DSH 文件；卸载时会停止它启动的
服务器。回滚版本：

```bash
dsh plugin --profile desktop add dsh-profile-switcher@<previous-version>
```

## 文档

- [架构](docs/architecture.md)
- [集成契约](docs/integration-contracts.md)
- [安全模型](docs/security-model.md)
- [验证](docs/verification.md)
- [ADR](docs/adr/)

## 许可证

MIT，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)（wordmark SVG 复制自 MIT 许可的
DeepSeek Harness client primitives）。
