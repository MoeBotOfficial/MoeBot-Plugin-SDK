<img src="assets/moebot.svg" width="80" height="80" alt="猫猫机器人（MoeBot）Logo">

# 猫猫机器人（MoeBot）Plugin SDK v1

用于 Cloudflare Pages / Workers 上 猫猫机器人（MoeBot） 的独立插件 SDK。SDK 提供类型、构建器、配置协议和测试工具，不包含机器人核心源代码。需要 Node.js 22+。

## 开发与安装

```sh
npm install -D https://github.com/MoeBotOfficial/MoeBot-Plugin-SDK/releases/download/v1.4.0/qq-bot-plugin-sdk-1.4.0.tgz
```

推荐克隆 [每日插件](https://github.com/MoeBotOfficial/MoeBot-Plugin-Daily) 或 [系统插件](https://github.com/MoeBotOfficial/MoeBot-Plugin-Essentials) 作为模板，然后运行 `npm ci`、`npm run typecheck`、`npm test`。将 `dist/<id>-<version>.zip` 交给用户，通过 WebUI「插件管理」上传，启用并点击「保存并部署」。不要上传 GitHub 自动生成的源代码 ZIP。

```text
my-plugin/
├── plugin.json            # 身份、API 版本、命令、所需能力
├── config.schema.json     # WebUI 自动生成表单
├── src/index.ts           # 默认导出 Plugin 对象
├── tests/                 # 使用 SDK testing 模拟机器人能力
├── package.json
└── dist/my-plugin-1.0.0.zip
    ├── plugin.json        # 包含构建器生成的代码 SHA-256
    ├── config.schema.json
    └── plugin.mjs         # 编译并打包依赖后的独立 ESM
```

`plugin.json`：

```json
{"apiVersion":1,"id":"hello","name":"问候","version":"1.0.0","entry":"plugin.mjs","permissions":["reply.text"],"commands":[{"id":"hello","triggers":["/hello"],"mode":"prefix","description":"发送问候"}]}
```

`config.schema.json`：

```json
{"type":"object","properties":{"greeting":{"type":"string","title":"问候语","default":"你好","maxLength":100}},"required":["greeting"],"additionalProperties":false}
```

`src/index.ts`：

```ts
import { definePlugin } from '@qq-bot/plugin-sdk';
export default definePlugin<{greeting:string}>({
  async onCommand(ctx) {
    await ctx.reply.text(`${ctx.config.greeting} ${ctx.command.args}`);
  }
});
```

在 package.json 添加 `"build":"qq-plugin build"`，运行 `npm run build`。构建器只处理本地开发环境，不在机器人请求过程中编译。所有依赖必须打入单个 ESM；不支持 Node 内置模块、外部 import、dynamic import 或 import.meta。ZIP 根目录严格包含上述 3 个文件。

## 与机器人交互

- `ctx.message`：只读的文字、发送者、群、会话、渠道、QQ 自动 @ 状态和当前请求的节点信息。没有原始 ENV、CF Token、QQ AppSecret 或数据库对象。
- `ctx.command`：命令 ID、匹配触发词、参数。默认 `exact` 精确匹配；`prefix` 按第一个空白前的词匹配。触发词不允许空白；不支持正则扫描。`/clear`、`/proactive` 为核心保留命令，启用插件之间不能重名。
- `ctx.reply.text()` / `.image()`：通过机器人适配器发送回复，图片须为 HTTPS。命令及应答不会进入 AI 上下文。
- `ctx.reply.markdown(text)`（核心 0.8.0+）：发送 QQ Markdown 消息。必须在 `plugin.json` 声明 `"reply.markdown"` 能力，并由管理员在 WebUI「插件设置」中显式开启「Markdown 消息」授权（默认关闭）。未授权或旧核心上该函数为 `undefined`，请用 `typeof ctx.reply.markdown === 'function'` 判断并降级到文字。内容 1~4000 字符，支持标题、粗斜体、删除线、链接、图片（公网直链）、列表、引用与分割线；换行用 `\n`。与 text/image 共用每次命令 3 次回复预算。
- `ctx.storage.get/set/delete/putIfDay`：JSON 存储，自动以插件 ID 隔离；`putIfDay(key,{day,...})` 原子保留同一天已存在的值。每值最多 4000 字符，每次处理最多 8 次存储操作。ID 是数据身份，升级不要随意改 ID。
- `ctx.http.json(url,{timeoutMs})`：HTTPS GET，禁止重定向，单响应最多 1 MiB，每次处理最多 4 个请求，超时 1–15 秒。SDK 网络封装是使用约定，不是防恶意代码的网络沙箱。
- `ctx.commands`：当前渠道已启用插件及核心命令目录，供帮助面板使用。
- `ctx.runtime`（核心 0.7.7+）：`version` 是后端版本；`await getDeployedAt()` 返回 Cloudflare 已确认的生产部署时间（ISO 8601），尚未确认时返回 `null`。旧核心没有此字段，请使用可选访问。只有显式调用该方法才读取部署记录；普通消息不增加数据库查询。测试可向 `createTestContext` 传入 `runtime` 模拟时间。
- `beforeModel(ctx)`：需声明 `model.context` 能力，在核心主动/被动判断决定调用 AI 后运行；返回 `{systemAppend:"补充要求"}`。单插件最多 2000 字符，总共最多 4000；此钩子不能调用 SDK 回复接口。不会创建额外模型请求，不支持自行注册模型工具或改变现有 reply 工具协议。
- `ctx.log.info/error()`：核心只记录插件 ID 与事件类别，避免无意记录配置密钥；传入的详细文本不输出。

插件必须 `await` 完成本次处理，不应保留 context、开启后台循环或依赖全局内存保存业务数据。SDK 在处理结束后关闭本次能力对象。异步错误会被核心捕获；插件命令失败不会误转为 AI 对话。同步死循环不能在同一个 Worker 内被可靠抢占。

## 配置、开关与密钥

首版 schema 支持一层字段：`string`、`boolean`、`integer`、`number`，支持 `title`、`description`、`default`、`enum`、`required`、长度及数值范围。暂不支持嵌套对象、数组、自定义浏览器脚本/HTML或远程表单组件。

字符串字段加 `"x-secret":true` 即生成密钥控件。不能在包里设置非空默认密钥。WebUI 只展示是否配置，以保持、替换、删除操作合并。密钥放入 CF secret ENV，仅由运行时注入 `ctx.config`；不会进入生成入口代码、插件 ZIP 或浏览器草稿。CF 管理员和同 Worker 内的可信执行代码不构成隔离安全域。

安装、开关、范围（群聊/私聊）、设置、升级和卸载均需要一次重新部署。插件包和普通设置随部署加密保存，管理 API 验证 CF 编辑权限后恢复。浏览器草稿按后端地址和部署版本保存；密钥草稿只在内存里。卸载默认保留 D1 数据，重装同 ID 可继续使用。代码回滚不等于数据回滚。

## 资源与信任边界

最多 8 个安装插件，单模块 128 KiB，模块合计 512 KiB，单 ZIP 256 KiB。每次命令最多 3 条 SDK 回复。核心在实例初始化时建立命令索引，普通消息不逐个调用插件 match，也不查询配置数据库。

插件文件与核心文件独立，但运行在同一个 Worker isolate，CPU 额度共享。SDK 能力检查不能隔离恶意 JavaScript；只安装可信来源插件。打包和压缩不是源码加密，也不能让交付给管理员的 JavaScript 永远不可逆向。

Cloudflare 免费 Workers 请求 CPU 上限为 10ms（包括 waitUntil 的计算），等待网络不等于 CPU，但 JSON 解析、加密、打包和插件计算会占用 CPU。部署组装放在浏览器中，管理 API 仍有自己的 CPU/请求开销。限制包大小不代表保证任意插件能在免费额度内运行，需通过 CF 指标和真实负载验证；重计算插件应调用外部服务。

## SDK 文件用途

- `src/index.d.ts`：完整类型契约，供 TypeScript 和 AI 阅读。
- `src/index.js`：极小的 definePlugin 帮助函数。
- `src/protocol.js`：离线/管理阶段使用的包、配置、冲突验证；不在聊天热路径验证 ZIP。
- `src/testing.js`：模拟回复、图片、存储和 HTTP 的测试 context。
- `bin/qq-plugin.mjs`：esbuild 编译、依赖打包、导出检查、哈希和 ZIP 输出。
- `AI-PLUGIN-PROMPT.md`：可直接交给 AI 的开发提示。

版本策略：`apiVersion:1` 为稳定的核心交互协议，插件 `version` 使用 SemVer。核心不支持的 API 版本拒绝安装。新 SDK 若有破坏性契约修改应提升 API 版本。

## 1.0.1：MoeBot 品牌更新

项目正式名称为**猫猫机器人（MoeBot）**，统一使用猫猫 SVG Logo。仓库地址、npm 包名、CLI、插件 ID、发布产物文件名和插件 API v1 保持兼容。

## 1.0.2：简化 Logo

使用眼睛、小嘴和胡须组成的单色猫脸符号，去掉外轮廓和底板。插件 API v1 保持不变。

## 1.0.3：加强图标辨识度

恢复绿色圆角底板，以粗白线绘制猫猫的眼睛、小嘴和胡须，适配控制台与 favicon 小尺寸显示。

## 1.0.4：明确猫脸五官

Logo 使用独立的椭圆眼睛、倒三角鼻子和猫嘴，保留绿色圆角底板与短胡须。

## 指令面板声明（SDK 1.1.0 / MoeBot 0.7.5）

`plugin.json` 中每条命令可选增加 `panel`。不声明时，使用原 `description` 和声明顺序；`ctx` 和插件运行代码均无需调整。

```json
{"id":"fortune","triggers":["/jrrp",".jrrp"],"description":"查询今天的人品值","panel":{"order":100,"description":"今日人品"}}
```

- `order`：-10000 到 10000 的整数，越小越靠前。同序按核心、插件安装及清单顺序排列。
- `description`：1 到 240 字符的面板说明，不改变机器人命令帮助文案。
- 不支持自定义面板 `name`、网络地址、凭据、函数或回调。面板归核心统一管理，由适配器在保存部署后同步。
- QQ 点击菜单自动补 `/`。请在 `triggers` 中声明**真实可执行的斜杠入口**；非斜杠入口继续工作，但不会自动出现在 QQ 面板。一个命令的多个斜杠入口都会列出（例如不同作品的图片命令），避免遗漏不同操作。
- QQ 名称最长 14、说明最长 30 单位，ASCII 计 1，中文计 2；每场景最多 20 项。说明可缩短，命令名不可截断，跳过原因可在 WebUI 查看。群聊、私聊按已安装插件的使用范围分别计算。

插件作者不调用平台面板 API，不读取机器人凭据，不注册新的 SDK `ctx` 方法。旧插件无需迁移；添加展示声明后，重新构建 ZIP，再上传 WebUI 保存并部署即可。

## Markdown 按钮（核心 0.8.1 / SDK 1.4.0）

保留 `ctx.reply.markdown(text)`，新增 `ctx.reply.markdown(text, { keyboard: { rows: [{ buttons: [...] }] } })`。插件必须同时声明 `reply.markdown`、`reply.keyboard`，管理员须分别开启「Markdown 消息」「Markdown 按钮」授权。默认均关闭；关闭 Markdown 同时撤销按钮。安装项 `keyboard: true` 随完整安装集合加密恢复、更新保留；按钮与文字、图片、Markdown 共用每次调用三条回复预算。`ctx.reply.keyboard === true` 用于能力降级判断。

```ts
await ctx.reply.markdown('# 按钮演示', { keyboard: { rows: [{ buttons: [
  { id: 'help', render_data: { label: '帮助', visited_label: '再次查看', style: 0 },
    action: { type: 2, permission: { type: 2 }, data: '/help', enter: true,
      reply: true, unsupport_tips: '请手动发送 /help' } },
  { id: 'confirm', render_data: { label: '确认', visited_label: '已确认', style: 1 },
    action: { type: 1, permission: { type: 2 }, data: 'confirm', unsupport_tips: '请升级 QQ' } },
] }] } });
```

指令按钮（type=2）沿用普通消息命令分发。回调按钮（type=1）须定义 `onInteraction(ctx)`：通过 `ctx.interaction.buttonId/data` 处理业务，尽快 `await ctx.interaction.respond(0)`，再通过 `ctx.reply` 发送后续消息。响应码 0 成功、1 失败、2 频繁、3 重复、4 无权限、5 仅管理员；每个互动只能回应一次。未手动回应时，核心在处理成功后自动回应 0，异常回应 1，未知/未授权/停用/越范围回调回应 4。回应已尝试后不会因网络异常重试。互动独立于聊天、AI、MCP 和 messages 历史。

键盘最多 5 行，每行 5 个按钮，单条消息内 ID 唯一（1..64 UTF-8 字节），label/visited_label 1..80 字节、style 0/1；data 1..512 字节，unsupport_tips 1..200 字节。只接受文档字段，支持 permission.type 0 指定用户（1..10 个 specify_user_ids）、1 管理员、2 所有人；群聊/私聊不支持频道身份组。reply/enter 只支持指令按钮；不支持模板、跳转、anchor 和弃用字段。核心对回调 data 加 HMAC 签名后以 QQ keyboard.content 发送，插件读取的是原始 data；签名绑定插件版本、会话、按钮 ID、指定用户，签名密钥轮换或插件升级会使旧按钮失效。QQ 执行管理员权限校验；核心再次检查指定用户。

核心在单个 isolate 内对五分钟内最多 256 个互动 ID 去重，不能保证跨 isolate 的 exactly-once。涉及持久状态的业务须自己做幂等处理。回调 handler 与命令一样必须 await 所有异步操作，不应在回应前执行慢任务。

发布包与管理 capabilities 声明 `pluginKeyboard: 1`；目标核心没有该标记时，浏览器在保存配置前拒绝声明按钮的插件。旧核心固定权限表也会拒绝。0.8.1 后端要求按钮安装集合的部署计划带 `keyboardPlan: 1`，阻止旧控制台更新时丢失授权。三份 protocol.js（核心、WebUI、SDK）必须字节一致。

QQ 需订阅 `INTERACTION_CREATE`（INTERACTION intent `1 << 26`），互动 type 11/12 使用 `PUT /interactions/{d.id}` 回应；其他类型不发 PUT。后续群聊/私聊消息使用外层事件 `payload.id` 作为 event_id，不能当 msg_id。官方自定义按钮标为「内邀开通」：普通 Markdown 可用不代表账号已开通自定义键盘。开通权限、事件订阅和客户端显示仍须 QQ 平台实际验证。

官方依据：[消息按钮](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/trans/msg-btn.html)、[互动事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/interaction_create.html)、[回应互动](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/interactions_interaction_id.put.html)。
