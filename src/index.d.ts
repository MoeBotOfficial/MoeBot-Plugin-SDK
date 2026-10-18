export interface Message {
  readonly text: string; readonly sender: string; readonly senderName?: string;
  readonly sessionId: string; readonly groupId?: string; readonly channelType: 'group' | 'c2c';
  readonly platform: string; readonly isAt: boolean; readonly autoAtOnReply?: boolean;
  readonly meta?: { cf?: { colo?: string; country?: string; httpProtocol?: string; tlsVersion?: string }; receivedAt?: number | string };
}
export interface CommandInfo { pluginId: string; id: string; triggers: readonly string[]; description: string; }
/** QQ group/C2C inline keyboard (core >=0.8.1): at most 5 rows of 5 buttons. */
export type ButtonPermission = { type: 0; specify_user_ids: string[] } | { type: 1 | 2 };
export interface KeyboardButton {
  id: string;
  render_data: { label: string; visited_label: string; style: 0 | 1 };
  /** data: 1..512 UTF-8 bytes; callback data is signed and restored by the core. */
  action: ({ type: 1 } | { type: 2; reply?: boolean; enter?: boolean }) & {
    permission: ButtonPermission; data: string; unsupport_tips: string;
  };
}
export interface Keyboard { rows: { buttons: KeyboardButton[] }[] }
export type InteractionResponseCode = 0 | 1 | 2 | 3 | 4 | 5;
export interface Interaction {
  readonly id: string; readonly buttonId: string; readonly data: string;
  /** Respond once, promptly. The core auto responds 0 on success, 1 on failure. */
  respond(code?: InteractionResponseCode): Promise<void>;
}
export interface PluginContext<C = Record<string, unknown>> {
  readonly interaction?: Interaction;
  readonly message: Message; readonly config: Readonly<C>;
  /** Available on core >=0.7.7. Time comes from the confirmed Cloudflare deployment, not an isolate start. */
  readonly runtime?: { readonly version: string; getDeployedAt(): Promise<string | null> };
  readonly command: { id: string; trigger: string; args: string };
  readonly commands: readonly CommandInfo[];
  readonly storage: { get<T = unknown>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void>; putIfDay<T extends {day: string}>(key: string, value: T): Promise<T> };
  readonly reply: {
    text(text: string): Promise<void>; image(url: string): Promise<void>;
    /** 需在 plugin.json 声明 "reply.markdown" 权限，并由管理员在控制台"插件设置"中显式授权后才存在；旧核心或未授权时为 undefined，请用可选访问。核心 >=0.8.0。每次命令与 text/image 共用 3 次回复预算，内容 1~4000 字符。 */
    markdown?(text: string, options?: { keyboard: Keyboard }): Promise<void>;
    /** Present only with both reply.markdown/reply.keyboard declarations and explicit grants. */
    readonly keyboard?: true;
  };
  readonly http: { json<T = unknown>(url: string, options?: { timeoutMs?: number }): Promise<T> };
  readonly log: { info(message: string): void; error(message: string): void };
}
export interface Plugin<C = Record<string, unknown>> {
  onCommand?(context: PluginContext<C>): Promise<void>;
  /** Authenticated button callback; separate from chat, AI, MCP and history. */
  onInteraction?(context: PluginContext<C>): Promise<void>;
  /** Adds a bounded instruction to the existing model turn; no extra AI request. */
  beforeModel?(context: PluginContext<C>): Promise<{ systemAppend?: string } | void>;
}
export declare function definePlugin<C = Record<string, unknown>>(plugin: Plugin<C>): Plugin<C>;
