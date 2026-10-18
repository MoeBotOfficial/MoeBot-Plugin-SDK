import test from 'node:test';import assert from 'node:assert/strict';
import {validateManifest,validateConfig,validatePackage,validateInstallation,validateKeyboard,digest} from '../src/protocol.js';
const manifest={id:'example',name:'Example',version:'1.0.0',entry:'plugin.mjs',apiVersion:1,permissions:['reply.text'],commands:[{id:'hello',triggers:['/hello'],description:'Hello'}]};
const schema={type:'object',properties:{text:{type:'string',default:'hello'},key:{type:'string','x-secret':true}},required:['key']};
test('schema defaults, secrets, primitive types and unknown keys',()=>{assert.throws(()=>validateConfig(schema,{}));assert.equal(validateConfig(schema,{}, {secretPresence:{key:true}}).text,'hello');assert.throws(()=>validateConfig(schema,{unknown:1}));assert.throws(()=>validateConfig(schema,{text:false},{enabled:false}));});
test('reserved core commands cannot be registered',()=>{assert.throws(()=>validateManifest({...manifest,commands:[{id:'clear',triggers:['/clear'],description:'bad'}]}));});
test('integrity and command collisions',async()=>{const code='export default {}';const p={format:1,manifest,schema:{type:'object',properties:{}},code,sha256:await digest(code)};await validatePackage(p);await assert.rejects(validatePackage({...p,code:code+';'}));const i={package:p,enabled:true,scopes:['group','c2c'],config:{}};await assert.rejects(validateInstallation([i,{...i,package:{...p,manifest:{...manifest,id:'other'}}}]));});
test('markdown capability is declared in the manifest and gated by an explicit installation grant',async()=>{
  const md={...manifest,permissions:['reply.text','reply.markdown']};
  validateManifest(md);
  const code='export default {async onCommand(){}}';const p={format:1,manifest:md,schema:{type:'object',properties:{}},code,sha256:await digest(code)};
  await validatePackage(p);
  const item={package:p,enabled:true,scopes:['group','c2c'],config:{}};
  await validateInstallation([item]);
  await validateInstallation([{...item,markdown:true}]);
  await assert.rejects(validateInstallation([{...item,markdown:'yes'}]),/Markdown 授权无效/);
  await assert.rejects(validateInstallation([{package:{...p,manifest},enabled:true,scopes:['group'],config:{},markdown:true}]),/Markdown 授权无效/);
  // 旧核心以固定旧权限表校验：新权限不在表中即被明确拒绝（不会静默忽略）。该表是 0.7.x 的 PERMISSIONS 快照。
  const OLD_PERMISSIONS=['reply.text','reply.image','storage','http','model.context'];
  assert.ok(md.permissions.some(x=>!OLD_PERMISSIONS.includes(x)),'声明 reply.markdown 的插件必须被旧核心拒绝');
});

test('optional panel declarations remain data-only and backward compatible',()=>{
  validateManifest(manifest);
  const command=manifest.commands[0];
  validateManifest({...manifest,commands:[{...command,panel:{order:-10,description:'面板说明'}}]});
  for(const panel of [null,[],{name:'spoof'},{order:1.2},{order:10001},{description:''},{description:'x\nunsafe'},{description:'x'.repeat(241)},{url:'https://example.com'}])assert.throws(()=>validateManifest({...manifest,commands:[{...command,panel}]}));
});

test('keyboard declarations require Markdown and explicit grants; helpers preserve callback data',async()=>{
 const m={...manifest,permissions:['reply.text','reply.markdown','reply.keyboard']};validateManifest(m);assert.throws(()=>validateManifest({...m,permissions:['reply.keyboard']}));
 const code='export default {}',p={format:1,manifest:m,schema:{type:'object',properties:{}},code,sha256:await digest(code)};
 const item={package:p,enabled:true,scopes:['c2c'],config:{}};await validateInstallation([item]);await validateInstallation([{...item,markdown:true,keyboard:true}]);await assert.rejects(validateInstallation([{...item,keyboard:true}]));
 const k={rows:[{buttons:[{id:'confirm',render_data:{label:'确认',visited_label:'已确认',style:1},action:{type:1,permission:{type:2},data:'confirm',unsupport_tips:'请升级'}}]}]};assert.deepEqual(validateKeyboard(k),k);
 const {createTestContext}=await import('../src/testing.js');const t=createTestContext({keyboard:true,interaction:{data:'confirm'}});await t.context.reply.markdown('demo',{keyboard:k});await t.context.interaction.respond(0);assert.deepEqual(t.keyboards,[k]);assert.deepEqual(t.responses,[0]);await assert.rejects(t.context.interaction.respond(1));
});
