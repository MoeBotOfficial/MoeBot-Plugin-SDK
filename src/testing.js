export function createTestContext({ message = {}, config = {}, command = {}, commands = [], data = new Map(), http, runtime, markdown = true, keyboard = false, interaction } = {}) {
  const replies = [], images = [], markdowns = [], keyboards = [], responses = [];
  const context = { ...(interaction?{interaction:{id:'test-interaction',buttonId:'test-button',data:'test-data',...interaction,async respond(code=0){if(responses.length)throw new Error('Interaction already responded');responses.push(code);}}}:{}), message: { text:'',sender:'test-user',sessionId:'test-session',channelType:'c2c',platform:'qq',isAt:true,...message },config,command:{id:'',trigger:'',args:'',...command},commands,runtime,
    reply:{ async text(value){replies.push(value);}, async image(value){images.push(value);}, ...(markdown?{ async markdown(value,options){if(options&&!keyboard)throw new Error('Keyboard grant required');markdowns.push(value);keyboards.push(options?.keyboard?structuredClone(options.keyboard):undefined);},...(keyboard?{keyboard:true}:{}) }:{}), },
    storage:{async get(key){return structuredClone(data.get(key)??null);},async set(key,value){data.set(key,structuredClone(value));},async delete(key){data.delete(key);},async putIfDay(key,value){const old=data.get(key);if(old?.day!==value.day)data.set(key,structuredClone(value));return structuredClone(data.get(key));}},
    http:{json:http??(async()=>{throw new Error('HTTP mock required');})},log:{info(){},error(){}} };
  return {context,replies,images,markdowns,keyboards,responses,data};
}
