/** Synthetic source-rendered review, not an Expo/native runtime. No network/services. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..'),mobile=resolve(root,'apps/platform-lab/src/mobile');
let size=390,action=null;
const element=(type,props,...children)=>typeof type==='function'?type({...props,children:children.length?children:props?.children??[]}):{type,props:props??{},children:children.flat(Infinity)};
const react={createElement:element,Fragment:'fragment',useMemo:f=>f(),useCallback:f=>f,useEffect:()=>{},useRef:v=>({current:v}),useState:v=>[typeof v==='function'?v():v,()=>{}]};
const native={...Object.fromEntries(['View','Text','Pressable','ScrollView','TextInput','Image','ImageBackground','ActivityIndicator','KeyboardAvoidingView','Modal'].map(x=>[x,x])),StyleSheet:{create:v=>v,absoluteFill:{position:'absolute',top:0,bottom:0,left:0,right:0}},useWindowDimensions:()=>({width:size,height:840,fontScale:1}),Platform:{OS:'android'},Keyboard:{dismiss(){}},AppState:{currentState:'active',addEventListener:()=>({remove(){}})}};
const sample={prior:{starts:'52',time:'31:42'},workHours:'16,5',roles:[],current:{time:'42:18',starts:'68',unknownDurationCount:0,unknownDateCount:0},latest:{flightId:'synthetic-flight',date:'01.11.2026',duration:'1:42 h',model:'ASK 21',registration:'D-EX01',orderUnknown:false}};
const cache=new Map();
function load(file){
  if(cache.has(file))return cache.get(file);
  if(/\.(png|jpg)$/.test(file))return `data:image/${extname(file)==='.png'?'png':'jpeg'};base64,${readFileSync(file).toString('base64')}`;
  const result={};cache.set(file,result);
  const require=name=>{
    if(name==='react')return react;if(name==='react-native')return native;
    if(name==='./start-preview')return{startDashboard:()=>sample};
    if(name==='./real-flight-statistics')return{formatReportedMinutes:n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0'),summarizeRealFlights:()=>({season:{aircraft:[{aircraft:'D-EX01',color:'#46ccff',count:28,knownMinutes:1290,unknownDurationCount:0},{aircraft:'D-EX02',color:'#48dba5',count:24,knownMinutes:864,unknownDurationCount:0},{aircraft:'D-EX03',color:'#a794ff',count:16,knownMinutes:384,unknownDurationCount:0}]}})};
    if(name.includes('expense-analysis-native'))return{readFinancialAnalysisNative:async()=>null};
    if(name.includes('expense-projection'))return{projectExpenses:()=>null};
    if(name==='./financial-analysis-model')return{expenseMoney:()=> '—'};
    let target=resolve(dirname(file),name);
    if(!extname(target))target=['.tsx','.ts'].map(s=>target+s).find(existsSync);
    if(!target)throw Error(`Review import missing: ${name}`);
    return load(target);
  };
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  runInNewContext(code,{exports:result,require,Date,Math,JSON,Error,Set,Map,Intl,Number,String,Array,Object});return result;
}
const {PilotHome}=load(resolve(mobile,'PilotHome.tsx')),{PaperWorkspace}=load(resolve(mobile,'PaperWorkspace.tsx')),{PilotClubOverview}=load(resolve(mobile,'PilotClubOverview.tsx')),{SubappNavigation}=load(resolve(mobile,'SubappNavigation.tsx')),{AiChat}=load(resolve(mobile,'AiChat.tsx')),{AppHeader}=load(resolve(mobile,'AppHeader.tsx'));
const {Card,Label,Section,Action}=load(resolve(mobile,'theme.tsx'));
const h=element,go=id=>()=>{action={page:id};},unavailable={status:'unavailable',items:[]};
const duties={status:'partial',clubLabel:'Segelflugverein · Beispiel',ownItems:[{start:'2026-11-07',end:'2026-11-07',duty:'Windenfahrer',people:['Beispiel Alex'],key:'synthetic-duty'}],laterOwn:[]};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function styles(v){return Object.assign({},...[v].flat(Infinity).filter(x=>x&&typeof x==='object'));}
function css(v){
  const s=styles(v),out={};
  const unitless=['flex','flexGrow','flexShrink','opacity','fontWeight','zIndex'];
  for(let [k,value]of Object.entries(s)){
    if(k==='transform'){out.transform=value.map(t=>Object.entries(t).map(([key,v])=>key+'('+v+')').join(' ')).join(' ');continue;}
    if(k==='fontVariant'||k==='resizeMode')continue;
    if(k==='experimental_backgroundImage'){out.backgroundImage=value;continue;}
    if(k==='paddingHorizontal'||k==='marginHorizontal'){out[k.replace('Horizontal','Left')]=value;out[k.replace('Horizontal','Right')]=value;continue;}
    if(k==='paddingVertical'||k==='marginVertical'){out[k.replace('Vertical','Top')]=value;out[k.replace('Vertical','Bottom')]=value;continue;}
    if(k==='borderTopColor')out.borderTopStyle='solid';
    if(k.endsWith('Width')&&k.startsWith('border'))out[k.replace('Width','Style')]='solid';
    out[k]=value;
  }
  return Object.entries(out).map(([k,v])=>`${k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}:${typeof v==='number'&&!unitless.includes(k)?v+'px':v}`).join(';');
}
function render(n){
  if(n===null||n===undefined||typeof n==='boolean')return'';
  if(typeof n!=='object')return esc(n);
  if(Array.isArray(n))return n.map(render).join('');
  const {type,props:p,children}=n;
  if(type==='fragment')return children.map(render).join('');
  const style=typeof p.style==='function'?p.style({pressed:false}):p.style;
  let click='';if(p.onPress&&!p.disabled){action=null;p.onPress();if(action)click=` onclick='navigate(${JSON.stringify(action)})'`;}
  const tag=type==='Text'?'span':type==='Pressable'?'button':type==='Image'?'img':type==='TextInput'?'textarea':'div';
  const klass=type==='Text'?'text':type==='Image'?'art':type==='TextInput'?'input':'box';
  const label=p.accessibilityLabel?` aria-label="${esc(p.accessibilityLabel)}"`:'';
  const selected=p.accessibilityState?.selected?' data-selected="true"':'';
  if(tag==='img')return `<img alt="" src="${p.source}" style="${css(style)}"/>`;
  const inside=type==='ScrollView'?`<div class="box" style="${css(p.contentContainerStyle)}">${children.map(render).join('')}</div>`:children.map(render).join('');
  return `<${tag} class="${klass}" style="${css(style)}"${label}${click}${selected}${p.disabled?' disabled':''}>${tag==='textarea'?esc(p.value||p.placeholder):inside}</${tag}>`;
}
function page(id){
  if(id==='home')return h(PilotHome,{view:{snapshot:{account:{accountRef:'synthetic'}},flights:[]},preview:null,phase:'ready',now:Date.UTC(2026,10,2,12),duties,medical:null,medicalLoading:false,active:false,reload:0,onPaper:go('logbook'),onFlights:go('flights'),onFlight:go('flights'),onStatistics:go('statistics'),onCosts:go('costs'),onDuties:go('club'),onClub:go('club'),onAssistant:go('ai'),onMedical:go('medical'),onUpdate:go('home')});
  if(id==='logbook')return h(PaperWorkspace,{onFlights:go('flights')});
  if(id==='club')return h(PilotClubOverview,{duties,information:{events:unavailable,documentNotices:unavailable,tasks:unavailable},onSection:go('club')});
  if(id==='ai')return h(AiChat,{active:true,conversations:[],selectedId:null,enabled:false,busy:false,loading:false,storageReady:true,notice:'Der AI-Dienst ist noch nicht freigeschaltet. Entwürfe bleiben lokal.',usage:null,feature:'question',onCreate:()=>{},onSelect:()=>{},onDelete:()=>{},onDraft:text=>{action={draft:text};},onSend:()=>{},onCancel:()=>{},onToggle:()=>{},onFeature:()=>{},onEvidence:()=>{}});
  if(id==='medical')return h(Card,null,h(Section,{title:'Medical'}),h(Label,null,'Ablaufdatum unbekannt'),h(Label,{muted:true},'Quellendetails stehen im nativen Medical-Modul bereit.'));
  // These retained detail modules are represented by a plainly labelled preview notice.
  return h(Card,null,h(Section,{title:{flights:'Flüge',costs:'Kosten',statistics:'Statistik'}[id]}),h(Label,null,'Dieses Detailmodul ist in der App verbunden.'),h(Label,{muted:true},'Die bestehende Flugliste, Kostenbelege und interaktiven Diagramme werden in diesem statischen Designreview nicht emuliert.'),h(Action,{onPress:go('home')},'Zurück zur Übersicht'));
}
const names={home:'Start',flights:'Flüge',logbook:'Papierflugbuch',club:'Verein',costs:'Kosten',statistics:'Statistik',ai:'Assistent',medical:'Medical'};
function frame(id,width){size=width;const rail=width>=840;
  const header=render(h(AppHeader,{title:names[id],variant:id==='home'?'branded':'page',back:id==='home'?undefined:go('home'),children:h('Pressable',{onPress:go('home'),style:{minWidth:48,minHeight:48}},h(Label,null,'⌂'))}));
  const nav=render(h(SubappNavigation,{selected:id==='home'||id==='medical'?null:id,rail,onHome:go('home'),onSelect:id=>{action={page:id};}}));
  const body=`<div class="surface"><header>${header}</header><main>${render(page(id))}</main></div>`;
  return `<section class="screen ${rail?'wide':''}" data-page="${id}" data-size="${width}" ${id!=='home'?'hidden':''}>${rail?nav:''}${body}${rail?'':nav}</section>`;
}
const screens=[390,1000].map(w=>Object.keys(names).map(id=>frame(id,w)).join('')).join('');
const output=resolve(root,'docs/product/design/proposals/pilot-hub-review.html');mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoFlight · Pilot hub review</title><style>
*{box-sizing:border-box}body{margin:0;background:#060b13;color:#eaf4ff;font-family:Arial,sans-serif}button,textarea{font:inherit;color:inherit}button{cursor:pointer;border:0;background:none;text-align:left}button:focus-visible{outline:2px solid #43c9ff;outline-offset:-3px}button:disabled{cursor:default}.box{display:flex;flex-direction:column;flex-shrink:0;position:relative;border-width:0}.text{white-space:pre-wrap;overflow-wrap:anywhere;flex-shrink:1}img{object-fit:contain;flex-shrink:0}.review{max-width:1040px;margin:24px auto;padding:0 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.review p{font-size:12px;color:#9eb8cc;line-height:1.6;flex:1;min-width:250px}.review button{padding:12px;border:1px solid #26465c;border-radius:20px;font-size:13px}.screen{width:390px;height:840px;max-width:100%;margin:20px auto 40px;background:#051b2b;display:flex;flex-direction:column;overflow:hidden;border:1px solid #26465c;border-radius:24px}.screen.wide{width:1000px;flex-direction:row}.screen[hidden]{display:none}.surface{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column}header{flex-shrink:0}main{padding:20px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:16px}.wide main{padding-top:6px}.screen>.box{flex-shrink:0}.input{border:0;resize:none}aside{max-width:1000px;margin:0 auto 30px;color:#9eb8cc;font-size:12px;padding:20px;line-height:1.6}.palette{display:flex;gap:8px;flex-wrap:wrap}.palette span{padding:10px 14px;border-radius:12px;border:1px solid #26465c}
</style><div class="review"><strong>MoFlight · Pilot hub</strong><button onclick="setSize(390)">Phone · 390</button><button onclick="setSize(1000)">Wide · 1000</button><button onclick="navigate({page:'home'})">Start</button><p>Designreview · synthetische Beispieldaten. Aus React-Native-Präsentationsquellen gerendert, kein natives Laufzeitergebnis. Flüge/Kosten/Statistik-Details sind nur verlinkte Hinweise.</p></div>${screens}<aside><div class="palette"><span style="background:#051b2b">Deep blue #051B2B</span><span style="background:#0b2a40">Surface #0B2A40</span><span style="background:#43c9ff;color:#051b2b">Sky #43C9FF</span><span style="background:#f2c49c;color:#051b2b">Paper #F2C49C</span></div><p>Sechs Subapps bleiben ständig erreichbar. Jede hat eine Zusammenfassung auf Start. Originales Logo, lokaler Datenzugriff und bestehende Detailmodule bleiben erhalten. Native Darstellung, System-Back, Tastatur und Geräteabnahme sind noch offen.</p></aside><script>let currentPage='home',currentSize=390;function show(){document.querySelectorAll('.screen').forEach(s=>s.hidden=s.dataset.page!==currentPage||+s.dataset.size!==currentSize)}function navigate(a){if(a.page){currentPage=a.page;show()}if(a.draft){let input=document.querySelector('.screen:not([hidden]) textarea');if(input)input.value=a.draft}}function setSize(n){currentSize=n;show()}show();</script></html>`,'utf8');
console.log('Generated docs/product/design/proposals/pilot-hub-review.html (synthetic source-rendered review)');
