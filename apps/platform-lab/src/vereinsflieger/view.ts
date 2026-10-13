import { bridgeSource, flightUrl } from './probe';
export const VIEW_BACKUP = 'MoFlight App user view backup';
const viewReasons = ['view-controls','view-filter-controls','view-header-columns','view-contract-changed'] as const;
export class ViewProtectionError extends Error {
  constructor(readonly reason: typeof viewReasons[number]) { super('Provider view protection stopped.'); }
}
export function viewProtectionMessage(error: unknown): string | null {
  if (!(error instanceof ViewProtectionError)) return null;
  const messages = {
    'view-controls': 'Original view could not be read: required provider account, configuration or list controls are unavailable. No export settings changed.',
    'view-filter-controls': 'Original view could not be read: provider filter controls are unsupported. No export settings changed.',
    'view-header-columns': 'Original view could not be read: provider table headers do not match configured columns. No export settings changed.',
    'view-contract-changed': 'Original view could not be verified against the supported provider controls. No export settings changed.',
  };
  return messages[error.reason];
}
export const VIEW_PHASES = ['restore', 'verify'] as const;
export type ViewPhase = 'snapshot' | 'backup' | 'backup-load' | 'backup-verify' | typeof VIEW_PHASES[number];
export interface ViewPreferences {
  version: 2; accountLabel: string; preset: string; columns: string[];
  filters: { name: string; type: 'text' | 'checkbox' | 'select-one'; value: string; checked: boolean }[];
  sort: { column: string; icon: string }[]; role: string; period: string; reset: boolean;
}
const roles = ['Pilot', 'Pilot oder Fluglehrer', 'Fluglehrer', 'Begleiter', 'Pilot oder Begleiter'];
const defaultColumns = ['1','2','3','4','5','6','7','8','9','10','105','11','12','13','14','15'];
export function isDefaultView(v: Omit<ViewPreferences, 'reset'>): boolean {
  return v.preset === 'Konfiguration laden' && JSON.stringify(v.columns) === JSON.stringify(defaultColumns) && v.period === 'Das letzte Jahr' && v.role === 'Pilot' && !v.sort.length && v.filters.length > 0 && v.filters.every(f => f.type === 'checkbox' ? f.checked : f.type === 'text' ? f.value === '' : f.value === ':F:eq');
}
export function validateView(value: unknown): ViewPreferences {
  const v = value as ViewPreferences;
  const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
  if (!v || v.version !== 2 || !text(v.accountLabel, 200) || !v.accountLabel.trim() || !text(v.preset, 100) || !Array.isArray(v.columns) || !v.columns.length || v.columns.length > 128 || !v.columns.every(x => typeof x === 'string' && /^\d{1,4}$/.test(x)) || new Set(v.columns).size !== v.columns.length || !Array.isArray(v.filters) || !v.filters.length || v.filters.length > 500 || !roles.includes(v.role) || !text(v.period, 100) || !v.period || typeof v.reset !== 'boolean' || !Array.isArray(v.sort) || v.sort.length > 128) throw new Error('Unsupported original view.');
  const filters = v.filters.map(f => {
    if (!f || !/^((op_)?col\d{1,4}|col\d{1,4}_(all|\d{1,4}))$/.test(f.name) || !['text','checkbox','select-one'].includes(f.type) || !text(f.value, 512) || typeof f.checked !== 'boolean') throw new Error('Unsupported original filter.');
    return {name:f.name,type:f.type,value:f.value,checked:f.checked};
  });
  if (new Set(filters.map(f => f.name)).size !== filters.length) throw new Error('Ambiguous original filters.');
  const sort = v.sort.map(s => {
    if (!s || !v.columns.includes(s.column) || !text(s.icon, 80) || !/^icon-sort-[a-z-]+$/.test(s.icon)) throw new Error('Unsupported original sorting.');
    return {column:s.column,icon:s.icon};
  });
  if (new Set(sort.map(s => s.column)).size !== sort.length) throw new Error('Ambiguous sorting.');
  const result: ViewPreferences = {version:2,accountLabel:v.accountLabel,preset:v.preset,columns:[...v.columns],filters,sort,role:v.role,period:v.period,reset:v.reset};
  if (result.reset && !isDefaultView(result)) throw new Error('Unproven default view.');
  return result;
}
export function sameView(a: ViewPreferences, b: ViewPreferences): boolean {
  return a.accountLabel === b.accountLabel && JSON.stringify(a.columns) === JSON.stringify(b.columns) && JSON.stringify(a.filters) === JSON.stringify(b.filters) && JSON.stringify(a.sort) === JSON.stringify(b.sort) && a.period === b.period && a.role === b.role;
}
export function decodeView(data: string, sender: string, document: string, token: string, phase: ViewPhase, original: ViewPreferences | null): ViewPreferences | null {
  if (!bridgeSource(sender, document) || data.length > 400_000) throw new Error('Rejected view response.');
  const m = JSON.parse(data);
  if (!m || m.kind !== 'vf-view-v2' || m.token !== token || m.phase !== phase || !flightUrl(m.url) || new URL(m.url).origin !== new URL(document).origin) throw new Error('Original view could not be verified.');
  if (m.error) throw new ViewProtectionError(viewReasons.includes(m.reason) ? m.reason : 'view-contract-changed');
  if (phase === 'snapshot') return validateView(m.view);
  if (!original || m.accountLabel !== original.accountLabel || (m.status !== 'next' && !(phase === 'backup' && m.status === 'saved-request') && !(phase === 'backup-load' && m.status === 'load-request'))) throw new Error('Provider account changed; original view retained for recovery.');
  if (phase === 'verify' || phase === 'backup-verify') {
    const restored = validateView(m.view);
    if (!sameView(original, restored) || (original.reset ? restored.preset !== 'Konfiguration laden' : restored.preset !== VIEW_BACKUP && !(phase === 'verify' && restored.preset === original.preset))) throw new Error('Restored preferences differ from original evidence.');
  }
  return null;
}
// Relative scopes stay provider-managed; unused date-form defaults are not replayed.
const driver = String.raw`function(token, phase, original, backupName, defaultColumns) {
  if(window.top!==window || location.protocol!=='https:' || !['vereinsflieger.de','www.vereinsflieger.de'].includes(location.hostname) || location.pathname!=='/member/profile/flightlog.php') return;
  const q=s=>document.querySelector(s), all=s=>Array.from(document.querySelectorAll(s));
  const clean=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
  const accountLabel=clean(q('#divpageheadermenu')?.children[1]).replace(/^VEREINSFLIEGER\.DE\s*/,'').trim();
  const send=p=>window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-view-v2',token,phase,url:location.href,accountLabel,...p}));
  const next=view=>send({status:'next',...(view?{view}:{})}), click=e=>{if(!e || e.disabled)throw new Error();e.click();};
  const formSafe=f=>{if(!f || f.method.toLowerCase()!=='post')throw new Error();const u=new URL(f.getAttribute('action')||location.href,location.href);if(u.origin!==location.origin || u.pathname!==location.pathname)throw new Error();};
  const quick=q('form[name="frm_tablelist_quickconfig"]'), select=quick?.querySelector('select[name="lst_configavailable"]');
  const options=select?Array.from(select.options).filter(o=>!o.disabled&&!o.hidden):[];
  let reason='view-contract-changed';
  const read=()=>{
    reason='view-controls';
    if(!select||!accountLabel||!q('#tablelist_20'))throw new Error();
    const columns=all('#LST_VISIBLE > li').map(e=>e.getAttribute('value'));
    const f=q('#frmfilter');if(!f)throw new Error();
    reason='view-filter-controls';
    const filters=Array.from(f.elements).filter(e=>['text','checkbox','select-one'].includes(e.type)).map(e=>{if(!/^((op_)?col\d{1,4}|col\d{1,4}_(all|\d{1,4}))$/.test(e.name))throw new Error();return {name:e.name,type:e.type,value:e.value,checked:!!e.checked};});
    reason='view-header-columns';
    const headers=all('#tablelist_20 thead th');if(headers.length!==columns.length)throw new Error();
    const sort=headers.flatMap((h,i)=>Array.from(h.querySelectorAll('[class*="icon-sort-"]')).map(e=>({column:columns[i],icon:Array.from(e.classList).find(c=>c.startsWith('icon-sort-'))})));
    const v={version:2,accountLabel,preset:clean(select.selectedOptions[0]),columns,filters,sort,role:clean(q('#globalfilter2')),period:clean(q('#globalfilter')),reset:false};
    v.reset=v.preset==='Konfiguration laden'&&JSON.stringify(columns)===JSON.stringify(defaultColumns)&&v.period==='Das letzte Jahr'&&v.role==='Pilot'&&!sort.length&&filters.length>0&&filters.every(f=>f.type==='checkbox'?f.checked:f.type==='text'?f.value==='':f.value===':F:eq');reason='view-contract-changed';return v;
  };
  const matches=v=>v.accountLabel===original.accountLabel&&JSON.stringify(v.columns)===JSON.stringify(original.columns)&&JSON.stringify(v.filters)===JSON.stringify(original.filters)&&JSON.stringify(v.sort)===JSON.stringify(original.sort)&&v.role===original.role&&v.period===original.period;
  const load=()=>{
    const target=original.reset?options.find(o=>o.value==='-1'):options.find(o=>o.text===backupName&&o.value===backupName);
    if(!target)throw new Error();formSafe(quick);select.selectedIndex=Array.from(select.options).indexOf(target);select.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const menu=(selector,label)=>{
    const links=all(selector).filter(e=>clean(e)===label);if(links.length!==1)throw new Error();
    const href=links[0].getAttribute('href');if(typeof href!=='string'||!href.trim())throw new Error();
    const u=new URL(href,location.href);
    if(u.protocol!=='https:'||u.origin!==location.origin||u.pathname!==location.pathname||u.username||u.password)throw new Error();
    click(links[0]);
  };
  try {
    const current=read();
    if(phase==='snapshot'){
      send({view:current});return;
    }
    if(!original||original.accountLabel!==accountLabel)throw new Error();
    if(phase==='backup'){
      if(original.reset){next();return;}
      if(!matches(current))throw new Error();
      // The user reserves this one name for MoFlight; same-name replacement is
      // authorized only after the host has journaled this actual original view.
      click(q('a[title="Liste konfigurieren"]'));click(q('#tableconfigtab_li_2'));
      const input=q('#userlist_name');formSafe(input?.form);input.value=backupName;input.dispatchEvent(new Event('keyup',{bubbles:true}));input.dispatchEvent(new Event('blur',{bubbles:true}));
      send({status:'saved-request'});click(q('#btn_userlist_add'));return;
    }
    if(phase==='backup-load'||phase==='restore'){
      if(phase==='backup-load'&&!original.reset){send({status:'load-request'});load();return;}
      const target=original.reset?'Konfiguration laden':backupName;
      if(matches(current)&&(current.preset===target||(phase==='restore'&&current.preset===original.preset))){next();return;}
      // Reset restores the list structure but can retain the export's period
      // and participation. Restore those scopes through the original menus,
      // re-reading account/structure after every navigation before verification.
      if(phase==='restore'&&original.reset&&current.preset===target&&matches({...current,role:original.role,period:original.period})){
        if(current.role!==original.role){menu('#menu_globalfilter2 a',original.role);return;}
        if(current.period!==original.period){menu('#menu_globalfilter a',original.period);return;}
      }
      load();return;
    }
    if(phase==='backup-verify'||phase==='verify'){
      if(!matches(current)||(original.reset?current.preset!=='Konfiguration laden':current.preset!==backupName&&!(phase==='verify'&&current.preset===original.preset)))throw new Error();
      next(current);return;
    }
    throw new Error();
  }catch{send({error:'view-contract-changed',reason});}
}`;
export function viewScript(token: string, phase: ViewPhase, original: ViewPreferences | null): string {
  return `(${driver})(${JSON.stringify(token)},${JSON.stringify(phase)},${JSON.stringify(original)},${JSON.stringify(VIEW_BACKUP)},${JSON.stringify(defaultColumns)});true;`;
}
