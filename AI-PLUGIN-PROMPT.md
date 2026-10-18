请为 猫猫机器人（MoeBot）Plugin SDK v1 开发一个可在 Cloudflare Pages / Workers 运行的插件。
先阅读 SDK README.md、src/index.d.ts、src/protocol.js，以及官方 daily/essentials 示例，不要猜测接口。

需求：[填写你的功能、命令和配置项]

交付 plugin.json、config.schema.json、src/index.ts、测试、package.json、tsconfig.json 和中文 README。
使用 definePlugin 默认导出；在清单中完整声明 exact/prefix 命令及所用能力。
只通过 ctx.message / config / reply / storage / http / commands 与机器人交互，不导入私有核心，不访问 ENV、原始 QQ Token、原始数据库，不使用 Node 内置模块、eval、动态 import、后台循环或全局可变持久状态。
异步操作必须 await；命令错误不应重试发送多条重复消息；HTTP 只用 HTTPS，保持小体积、低 CPU。
配置 schema 只支持一层 string/boolean/number/integer 字段，密钥使用 x-secret 且无非空默认值。
如使用 AI beforeModel，仅返回 systemAppend，不直接发送回复、不添加模型工具。
如需要 Markdown 消息，在 plugin.json 声明 "reply.markdown" 能力，用 `ctx.reply.markdown` 并先做 typeof 判断（管理员默认不授权）；未授权时降级为 ctx.reply.text。Markdown 内容 1~4000 字符，图片只用公网 https 直链。
编写验证业务行为和失败边界的测试，使用 SDK testing 模拟 HTTP 和存储；不要调用真实 QQ/AI。
执行类型检查、测试及 qq-plugin build，交付生成的 ZIP。明确插件 ID、版本、命令、配置、能力、数据保留和 CPU 边界。

如需出现在 MoeBot 0.7.5 的 QQ 指令面板，请为命令声明实际可用的 `/` 入口，保持旧入口兼容。可在 `plugin.json` 的命令上添加 `panel: { order: 100, description: "简短说明" }`，不增加 `name`、凭据或网络操作。不改变 SDK ctx 契约。若处理器直接解析 `ctx.message.text`，须自行兼容新增斜杠。面板由部署流程统一生成和同步。

如需要 Markdown 按钮，先读取 SDK Keyboard/Interaction 类型，同时声明 reply.markdown 和 reply.keyboard；使用 ctx.reply.keyboard 判断授权。调用 markdown(text,{keyboard})，回调定义 onInteraction(ctx)，通过 ctx.interaction.respond(code) 先回应再发送消息。回调 data 由核心签名并还原，不要解析签名格式，也不要把回调当普通聊天消息。命令按钮 type=2、回调按钮 type=1；自己验证持久操作幂等性。最低核心0.8.1，测试禁止请求真实QQ。
