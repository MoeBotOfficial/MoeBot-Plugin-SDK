// Shared wire contract. No code evaluation; validation runs only during management/build.
export const LIMITS = Object.freeze({ plugins: 8, moduleBytes: 131072, totalBytes: 524288, zipBytes: 262144, fields: 32 });
export const PERMISSIONS = ['reply.text', 'reply.image', 'reply.markdown', 'reply.keyboard', 'storage', 'http', 'model.context'];
const encoder = new TextEncoder();
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const fail = (m) => { throw new Error(m); };
const object = (o) => o && typeof o === 'object' && !Array.isArray(o);
const safeKey = (s) => typeof s === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(s) && !['constructor', 'prototype', '__proto__'].includes(s);
export function validateManifest(m) {
  if (!object(m) || m.apiVersion !== 1 || !/^[a-z][a-z0-9-]{1,47}$/.test(m.id ?? '') || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(m.version ?? '') || typeof m.name !== 'string' || !m.name || m.name.length > 80 || m.entry !== 'plugin.mjs') fail('插件清单、SDK 版本或入口无效。');
  if (JSON.stringify(m).length > 16000) fail('插件清单过大。');
  if (!Array.isArray(m.permissions) || m.permissions.some(p => !PERMISSIONS.includes(p)) || new Set(m.permissions).size !== m.permissions.length) fail('插件权限无效。');
  if (m.permissions.includes('reply.keyboard') && !m.permissions.includes('reply.markdown')) fail('按钮能力需要声明 reply.markdown。');
  if (!Array.isArray(m.commands) || m.commands.length > 32) fail('插件命令列表无效。');
  const ids = new Set(), triggers = new Set();
  for (const c of m.commands) {
    if (!object(c) || !safeKey(c.id) || ids.has(c.id) || !['exact', 'prefix'].includes(c.mode ?? 'exact') || typeof c.description !== 'string' || c.description.length > 240 || !Array.isArray(c.triggers) || !c.triggers.length || c.triggers.length > 16) fail('插件命令定义无效。');
    if (c.panel !== undefined && (!object(c.panel) || Object.keys(c.panel).some(k => !['order','description'].includes(k)) || c.panel.order !== undefined && (!Number.isInteger(c.panel.order) || Math.abs(c.panel.order) > 10000) || c.panel.description !== undefined && (typeof c.panel.description !== 'string' || !c.panel.description.trim() || c.panel.description.length > 240 || /[\x00-\x1f\x7f]/.test(c.panel.description)))) fail('面板声明只支持 order（-10000 到 10000 的整数）和 description（1 到 240 字符）。');
    ids.add(c.id);
    for (const t of c.triggers) {
      if (typeof t !== 'string' || !t || t.length > 80 || t.trim() !== t || /[\s\x00-\x1f]/.test(t) || triggers.has(t) || ['/clear', '/proactive', '/mcp-cancel'].includes(t)) fail('插件命令重复、包含空格或占用核心命令。');
      triggers.add(t);
    }
  }
  return m;
}
export function validateSchema(s) {
  if (!object(s) || s.type !== 'object' || !object(s.properties) || Object.keys(s.properties).length > LIMITS.fields || JSON.stringify(s).length > 24000) fail('配置 schema 必须是最多 32 项字段的 object。');
  if (s.required !== undefined && (!Array.isArray(s.required) || s.required.some(k => !own(s.properties,k)))) fail('required 字段无效。');
  for (const [k, f] of Object.entries(s.properties)) {
    if (!safeKey(k) || !object(f) || !['string','boolean','number','integer'].includes(f.type)) fail('首版配置支持文本、布尔、数值、整数。');
    if (f['x-secret'] && f.type !== 'string') fail('密钥字段必须是字符串。');
    if (f.enum && (!Array.isArray(f.enum) || !f.enum.length || f.enum.length > 32)) fail('枚举配置无效。');
    for (const b of ['minimum','maximum','minLength','maxLength']) if (f[b] !== undefined && (!Number.isFinite(f[b]) || Math.abs(f[b]) > 1000000000)) fail('配置范围无效。');
    if (f.default !== undefined) checkValue(k, f, f.default);
    if (f['x-secret'] && f.default) fail('禁止在包内嵌入默认密钥。');
  }
  return s;
}
function checkValue(k, f, v) {
  if (f.type === 'integer' ? !Number.isSafeInteger(v) : typeof v !== f.type || typeof v === 'number' && !Number.isFinite(v)) fail(`${k} 类型不正确。`);
  if (typeof v === 'string' && (v.length > (f.maxLength ?? 4000) || v.length < (f.minLength ?? 0))) fail(`${k} 文本长度不正确。`);
  if (typeof v === 'number' && (v < (f.minimum ?? -Infinity) || v > (f.maximum ?? Infinity))) fail(`${k} 超出范围。`);
  if (f.enum && !f.enum.includes(v)) fail(`${k} 不在可选值中。`);
}
export function validateConfig(schema, input = {}, { enabled = true, secretPresence = {} } = {}) {
  validateSchema(schema);
  if (!object(input)) fail('配置必须为对象。');
  const result = {};
  for (const k of Object.keys(input)) if (!own(schema.properties,k)) fail(`未知配置项：${k}`);
  for (const [k,f] of Object.entries(schema.properties)) {
    const value = own(input,k) ? input[k] : f.default;
    if (value !== undefined) { checkValue(k,f,value); result[k] = value; }
    if (enabled && schema.required?.includes(k) && (value === undefined || value === '') && !secretPresence[k]) fail(`请填写必填项：${f.title || k}`);
  }
  return result;
}
export async function digest(text) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join(''); }
export async function validatePackage(p) {
  if (!object(p) || p.format !== 1 || typeof p.code !== 'string' || encoder.encode(p.code).length > LIMITS.moduleBytes) fail('插件包格式或大小无效。');
  validateManifest(p.manifest); validateSchema(p.schema);
  if (p.sha256 !== await digest(p.code)) fail('插件代码校验失败。');
  return p;
}
export async function validateInstallation(items) {
  if (!Array.isArray(items) || items.length > LIMITS.plugins) fail('最多安装 8 个插件。');
  let bytes = 0; const ids = new Set(), commands = new Set();
  for (const item of items) {
    await validatePackage(item.package);
    const m = item.package.manifest;
    if (ids.has(m.id)) fail('插件 ID 重复。'); ids.add(m.id);
    bytes += encoder.encode(item.package.code).length;
    if (typeof item.enabled !== 'boolean' || !Array.isArray(item.scopes) || item.scopes.some(s=>!['group','c2c'].includes(s)) || item.scopes.length > 2) fail('插件开关或使用范围无效。');
    if (item.markdown !== undefined && (typeof item.markdown !== 'boolean' || item.markdown && !m.permissions.includes('reply.markdown'))) fail('插件 Markdown 授权无效：只有声明 reply.markdown 的插件才能获得授权。');
    if (item.keyboard !== undefined && (typeof item.keyboard !== 'boolean' || item.keyboard && (!m.permissions.includes('reply.keyboard') || item.markdown !== true))) fail('插件按钮授权无效：需要声明 reply.keyboard 并开启 Markdown 授权。');
    validateConfig(item.package.schema, item.config, { enabled:item.enabled, secretPresence:item.secretPresence });
    if (item.enabled) for (const c of m.commands) for (const t of c.triggers) { if (commands.has(t)) fail(`命令冲突：${t}`); commands.add(t); }
  }
  if (bytes > LIMITS.totalBytes) fail('插件代码总量超过 512 KiB。');
  return items;
}

// QQ inline keyboards: a data-only, bounded subset for group/C2C bots. Return
// a fresh value so callbacks and send payloads cannot be changed after validation.
export function validateKeyboard(input, { signed = false } = {}) {
  const keys = (o, allowed) => object(o) && Object.keys(o).every(k => allowed.includes(k));
  const text = (s, max) => typeof s === 'string' && s.trim().length > 0 && encoder.encode(s).length <= max && !/[\x00-\x1f\x7f]/.test(s);
  if (!keys(input, ['rows']) || !Array.isArray(input.rows) || !input.rows.length || input.rows.length > 5) fail('按钮键盘需要 1 到 5 行。');
  const ids = new Set();
  const rows = input.rows.map(row => {
    if (!keys(row, ['buttons']) || !Array.isArray(row.buttons) || !row.buttons.length || row.buttons.length > 5) fail('每行需要 1 到 5 个按钮。');
    return { buttons: row.buttons.map(button => {
      if (!keys(button, ['id','render_data','action']) || !text(button.id,64) || ids.has(button.id)) fail('按钮 ID 必须唯一，最长 64 字节。');
      ids.add(button.id);
      const r = button.render_data, a = button.action;
      if (!keys(r, ['label','visited_label','style']) || !text(r.label,80) || !text(r.visited_label,80) || ![0,1].includes(r.style)) fail('按钮文字或样式无效。');
      if (!keys(a, ['type','permission','data','reply','enter','unsupport_tips']) || ![1,2].includes(a.type) || !text(a.data,signed ? 4096 : 512) || !text(a.unsupport_tips,200)) fail('只支持回调或指令按钮，需要 data 和兼容提示。');
      if (['reply','enter'].some(k => a[k] !== undefined && (a.type !== 2 || typeof a[k] !== 'boolean'))) fail('reply 和 enter 仅适用于指令按钮。');
      const p = a.permission;
      if (!keys(p, ['type','specify_user_ids']) || ![0,1,2].includes(p.type)) fail('按钮权限仅支持指定用户、管理员或所有人。');
      if (p.type === 0 ? !Array.isArray(p.specify_user_ids) || !p.specify_user_ids.length || p.specify_user_ids.length > 10 || p.specify_user_ids.some(id => !text(id,128)) : p.specify_user_ids !== undefined) fail('指定用户按钮需要 1 到 10 个用户 ID。');
      return {id:button.id,render_data:{...r},action:{...a,permission:{...p,...(p.type===0?{specify_user_ids:[...p.specify_user_ids]}:{})}}};
    }) };
  });
  if (encoder.encode(JSON.stringify(rows)).length > 16000) fail('按钮键盘总量不能超过 16000 字节。');
  return {rows};
}
