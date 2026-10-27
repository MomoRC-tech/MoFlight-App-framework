import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createSyncConfirmation} from '../../apps/platform-lab/src/mobile/sync-confirmation.ts';

const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/AiChatRoute.tsx',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
}).outputText;

async function fixture(options:{failFirstOpen?:boolean}={}){
 let index=0;const hooks:any[]=[],effects:(()=>void)[]=[],cleanups=new Map<number,()=>void>();
 const archive={ownerId:'owner-a',conversations:[{id:'chat-a',title:'Exact conversation',draft:'Keep draft',messages:[]},{id:'chat-b',title:'Other conversation',draft:'Other draft',messages:[]}]};
 const deleted:string[]=[];let current=true,listener:(state:string)=>void=()=>{};
 const workspace={ownerId:'owner-a',assertCurrent:async()=>{if(!current)throw Error('Owner changed');},close:async()=>{},identity:async()=>null,
  store:{archive:async()=>archive,recoverActive:async()=>{},touch:async()=>{},delete:async(id:string)=>{await workspace.assertCurrent();deleted.push(id);}}};
 let controller:any,opens=0;
 const react:any={Fragment:'Fragment',useRef(value:any){const i=index++;if(!(i in hooks))hooks[i]={current:value};return hooks[i];},
  useState(value:any){const i=index++;if(!(i in hooks))hooks[i]=value;return[hooks[i],(next:any)=>{hooks[i]=typeof next==='function'?next(hooks[i]):next;}];},
  useEffect(fn:()=>void,deps:any[]){const i=index++;if(!hooks[i]||deps.some((v,n)=>v!==hooks[i][n])){hooks[i]=deps;effects.push(()=>{cleanups.get(i)?.();const cleanup=fn();if(typeof cleanup==='function')cleanups.set(i,cleanup);});}},
  createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children:children.flat(Infinity)})};
 const modules:any={react:{default:react,...react},'react-native':{AppState:{currentState:'active',addEventListener:(_event:string,fn:any)=>{listener=fn;return{remove(){}};}}},
  'expo-crypto':{randomUUID:()=> 'new-chat'},'./AiChat':{AiChat:'AiChat'},'./AiDeleteConfirmationDialog':{AiDeleteConfirmationDialog:'DeleteDialog'},
  './sync-confirmation':{createSyncConfirmation},'../ai/workspace-native':{openAiWorkspaceNative:async()=>{opens++;if(options.failFirstOpen&&opens===1)throw Error('Synthetic local failure');return workspace;}},
  '../ai/run-controller':{AiRunController:class{busy=false;constructor(){controller=this;}cancel=async()=>{};}},
  '../ai/usage-monitor':{AiUsageMonitor:class{}},'../ai/chat-model':{chatDraftTitle:()=>''}};
 const context:any={exports:{},require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}};runInNewContext(source,context);
 const props={active:true,reload:0,onEvidence:async()=>{}};let tree:any;
 function render(){index=0;tree=context.exports.AiChatRoute(props);effects.splice(0).forEach(fn=>fn());}
 function find(type:string):any{function walk(n:any):any{return n&&typeof n==='object'?(n.type===type?n:n.children?.map(walk).find(Boolean)):null;}return walk(tree);}
 async function settle(){for(let i=0;i<8;i++){await new Promise<void>(resolve=>{setImmediate(resolve);});render();}}
 render();await settle();
 return{props,deleted,render,find,settle,background(){listener('background');render();},switchOwner(){current=false;},controller:()=>controller,
  request(){assert.equal(find('AiChat').props.loading,false,JSON.stringify(find('AiChat').props));find('AiChat').props.onDelete('chat-a');render();return find('DeleteDialog');},close(){for(const cleanup of cleanups.values())cleanup();}};
}

test('local deletion needs an explicit one-use decision for the captured conversation',async()=>{
 const f=await fixture();try{
 const dialog=f.request();assert.equal(dialog.props.title,'Exact conversation');assert.deepEqual(f.deleted,[]);
 dialog.props.onConfirm();dialog.props.onConfirm();await f.settle();assert.deepEqual(f.deleted,['chat-a']);
 }finally{f.close();}
});

test('dark delete dialog exposes separate cancel/confirm and dismisses on Back and outside tap',()=>{
 const compiled=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/AiDeleteConfirmationDialog.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
 }).outputText;
 const react={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children:children.flat(Infinity)})};
 const modules:any={react:{default:react},'react-native':{Modal:'Modal',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',useWindowDimensions:()=>({width:360,fontScale:1.6}),StyleSheet:{create:(value:any)=>value}},'./theme':{colors:{raised:'#0c3041',cyan:'#27d3d2'},ui:{}}};
 const context:any={exports:{},require:(name:string)=>modules[name]};runInNewContext(compiled,context);
 let cancel=0,confirm=0;
 const tree=context.exports.AiDeleteConfirmationDialog({title:'Exact conversation',onCancel:()=>{cancel++;},onConfirm:()=>{confirm++;}});
 const nodes:any[]=[];const visit=(node:any)=>{if(node&&typeof node==='object'){nodes.push(node);node.children?.forEach(visit);}};visit(tree);
 tree.props.onRequestClose();nodes.find(n=>n.type==='Pressable'&&n.props.accessible===false).props.onPress();
 nodes.find(n=>n.props.accessibilityLabel==='Abbrechen').props.onPress();assert.equal(cancel,3);assert.equal(confirm,0);
 nodes.find(n=>n.props.onPress&&n.props.onPress!==tree.props.onRequestClose&&n.props.accessibilityRole==='button').props.onPress();assert.equal(confirm,1);
 assert.ok(nodes.some(n=>n.children?.includes('Exact conversation')));
 assert.ok(nodes.some(n=>n.props.accessibilityViewIsModal));
 const scroller=nodes.find(n=>n.type==='ScrollView');const scrolled:any[]=[];
 const collect=(node:any)=>{if(node&&typeof node==='object'){scrolled.push(node);node.children?.forEach(collect);}};collect(scroller);
 assert.equal(scrolled.some(n=>n.props.accessibilityRole==='button'||n.props.accessibilityRole==='header'),false,'title and decisions remain outside scrolling conversation text');
});

test('cancel and lifecycle/owner/busy/selection changes reject stale delete callbacks',async()=>{
 for(const cause of ['cancel','background','inactive','owner','busy','selection','reload']){
 const f=await fixture();try{const dialog=f.request();assert.ok(dialog,cause);
 if(cause==='cancel')dialog.props.onCancel();
 if(cause==='background')f.background();
 if(cause==='inactive'){f.props.active=false;f.render();}
 if(cause==='owner')f.switchOwner();
 if(cause==='busy')f.controller().busy=true;
 if(cause==='selection'){f.find('AiChat').props.onSelect('chat-b');f.render();}
 if(cause==='reload'){f.props.reload++;f.render();}
 dialog.props.onConfirm();await f.settle();assert.deepEqual(f.deleted,[],cause);
 }finally{f.close();}
 }
});

test('a cancelled callback cannot consume a later deletion decision',async()=>{
 const f=await fixture();try{const old=f.request();old.props.onCancel();f.render();const next=f.request();
 old.props.onCancel();f.render();assert.ok(f.find('DeleteDialog'));
 old.props.onConfirm();await f.settle();assert.deepEqual(f.deleted,[]);
 next.props.onConfirm();await f.settle();assert.deepEqual(f.deleted,['chat-a']);
 }finally{f.close();}
});


test('failed local open offers local retry and restores persisted drafts without creating or sending',async()=>{
 const f=await fixture({failFirstOpen:true});try{
 let chat=f.find('AiChat');assert.equal(chat.props.storageReady,false);assert.equal(chat.props.loading,false);
 assert.match(chat.props.notice,/Daten bleiben erhalten/);assert.equal(typeof chat.props.onRetryLoad,'function');
 chat.props.onDraft('Must not replace saved draft');chat.props.onCreate();await f.settle();
 chat=f.find('AiChat');assert.equal(chat.props.conversations.length,0);
 chat.props.onRetryLoad();f.render();await f.settle();chat=f.find('AiChat');
 assert.equal(chat.props.storageReady,true);assert.equal(chat.props.onRetryLoad,undefined);
 assert.equal(chat.props.conversations.find((c:any)=>c.id==='chat-a').draft,'Keep draft');
 assert.equal(chat.props.selectedId,'chat-a');assert.deepEqual(f.deleted,[]);
 }finally{f.close();}
});
