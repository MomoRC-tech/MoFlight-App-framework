import { flightUrl } from './probe';
import { validateScope, type WindowScope } from './window';
// The actual opaque provider actions/links are discovered afresh from the DOM.
// No encoded query or record ID is constructed by this selector.
export const WINDOW_SELECTION_SOURCE=String.raw`(batchSize) => {
  if(window.top!==window||document.readyState!=='complete'||location.protocol!=='https:'||!['vereinsflieger.de','www.vereinsflieger.de'].includes(location.hostname)||location.pathname!=='/member/profile/flightlog.php')return {error:'session-required'};
  const roles=document.querySelectorAll('#globalfilter2');if(roles.length!==1)return {error:'unsupported-controls'};
  if(roles[0].textContent.trim()!=='Pilot oder Begleiter'){
    const links=Array.from(document.querySelectorAll('a[href]')).filter(a=>a.textContent.trim()==='Pilot oder Begleiter');
    if(links.length!==1)return {error:'unsupported-controls'};
    return {action:'participation',target:new URL(links[0].getAttribute('href'),location.href).href};
  }
  if(batchSize!==undefined){
    if(![5,200].includes(batchSize))return {error:'unsupported-controls'};
    const sizes=document.querySelectorAll('select[name="frm_rowsperpage"]');
    if(sizes.length!==1)return {error:'unsupported-controls'};
    const size=sizes[0],form=size.closest('form'),buttons=form?.querySelectorAll('button[value="save"]');
    if(!form||form.method.toLowerCase()!=='post'||buttons.length!==1||buttons[0].type!=='submit'||buttons[0].textContent.trim()!=='Anwenden'||Array.from(size.options).filter(o=>o.value===String(batchSize)).length!==1)return {error:'unsupported-controls'};
    if(size.value!==String(batchSize))return {action:'batch-size',target:new URL(form.getAttribute('action'),location.href).href};
  }
  const starts=document.querySelectorAll('#startdate'),ends=document.querySelectorAll('#enddate'),ranges=document.querySelectorAll('#daterange');
  if(starts.length!==1||ends.length!==1||ranges.length!==1||starts[0].type!=='text'||ends[0].type!=='text'||!Array.from(ranges[0].options).some(o=>o.value==='date'))return {error:'unsupported-controls'};
  const form=starts[0].closest('form');if(!form||ends[0].closest('form')!==form||ranges[0].closest('form')!==form||form.method.toLowerCase()!=='post'||form.querySelectorAll('input[type="submit"]').length!==1)return {error:'unsupported-controls'};
  return {action:'dates',target:new URL(form.getAttribute('action'),location.href).href};
}`;
export function validateSelection(value: unknown, document: string): {action:'participation'|'dates'|'batch-size';target:string} {
  if(!value||typeof value!=='object')throw new Error('Unsupported provider controls');const a=value as {action:string;target:string};
  if(!['participation','dates','batch-size'].includes(a.action)||typeof a.target!=='string'||!flightUrl(a.target)||new URL(a.target).origin!==new URL(document).origin||new URL(a.target).hash)throw new Error('Unrelated provider action');
  return {action:a.action as 'participation'|'dates'|'batch-size',target:a.target};
}
export function selectionScript(nonce: string,batchSize?:5|200) {return `window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-window-selection-v1',nonce:${JSON.stringify(nonce)},url:location.href,result:(${WINDOW_SELECTION_SOURCE})(${batchSize??'undefined'})}));true;`;}
export function submitBatchScript(batchSize:5|200,target:string,nonce:string){
  if(![5,200].includes(batchSize)||!flightUrl(target))throw new Error('Unrelated batch form');
  return `(() => {const expected=${JSON.stringify(target)},value=${JSON.stringify(String(batchSize))};
    const fail=()=>window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-window-submit-error',nonce:${JSON.stringify(nonce)},url:location.href}));
    if(window.top!==window||document.readyState!=='complete'||location.pathname!=='/member/profile/flightlog.php'||new URL(expected).origin!==location.origin)return fail();
    const sizes=document.querySelectorAll('select[name="frm_rowsperpage"]');if(sizes.length!==1)return fail();
    const size=sizes[0],form=size.closest('form'),buttons=form?.querySelectorAll('button[value="save"]');
    if(!form||form.method.toLowerCase()!=='post'||new URL(form.getAttribute('action'),location.href).href!==expected||buttons.length!==1||buttons[0].type!=='submit'||buttons[0].textContent.trim()!=='Anwenden'||Array.from(size.options).filter(o=>o.value===value).length!==1)return fail();
    size.value=value;size.dispatchEvent(new Event('change',{bubbles:true}));buttons[0].click();
  })();true;`;
}
export function submitWindowScript(scope: WindowScope, target: string, nonce: string) {
  const s=validateScope(scope);if(!flightUrl(target))throw new Error('Unrelated date form');
  return `(() => { const expected=${JSON.stringify(target)},from=${JSON.stringify(s.from)},through=${JSON.stringify(s.through)};
    const fail=()=>window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-window-submit-error',nonce:${JSON.stringify(nonce)},url:location.href}));
    if(window.top!==window||document.readyState!=='complete'||location.pathname!=='/member/profile/flightlog.php'||new URL(expected).origin!==location.origin)return fail();
    const start=document.querySelector('#startdate'),end=document.querySelector('#enddate'),range=document.querySelector('#daterange'),form=start?.closest('form');
    if(!form||end?.closest('form')!==form||range?.closest('form')!==form||new URL(form.getAttribute('action'),location.href).href!==expected||form.method.toLowerCase()!=='post')return fail();
    const submits=form.querySelectorAll('input[type="submit"]');if(submits.length!==1||!Array.from(range.options).some(o=>o.value==='date'))return fail();
    range.value='date';range.dispatchEvent(new Event('change',{bubbles:true}));
    const display=s=>s.slice(8)+'.'+s.slice(5,7)+'.'+s.slice(0,4);start.value=display(from);end.value=display(through);
    for(const field of [start,end]){field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));}
    submits[0].click();
  })();true;`;
}
