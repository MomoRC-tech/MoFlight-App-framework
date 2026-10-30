import { EXPORT_DRIVER_SOURCE } from './export';
import { EXPORT_HTTP_SOURCE, HTTP_EXPORT_READER_SOURCE, INERT_EXPORT_TEXT_SOURCE } from './export-http';

/** Fixed local fixtures only; lexical fetch replacement makes no provider calls. */
export const EXPORT_HTTP_FIXTURE_SOURCE = String.raw`async function() {
  const origin='https://vereinsflieger.de',base=origin+'/member/profile/flightlog.php';
  const expected={accountNumber:'123',clubLabel:'Synthetic Club',clubIdentity:'display-label-only',verification:'observed-profile-number'};
  const request={from:'2026-01-01',to:'2026-12-31'},headers=['Datum','Lfz.','Start','Landung','Flugzeit','Pilot'];
  const profile='<nav id="topnavi"><a href="../community/main">Synthetic Club</a></nav><table class="tablelist alternative"><tr><td>Benutzernummer</td><td>123</td></tr></table>';
  const page=(number,total=1,decorated=false)=>{
    const first=total?(number-1)*500+1:0,last=Math.min(number*500,total),rows=[];
    for(let id=first;id&&id<=last;id++)rows.push('<tr id="row'+id+'"><td>01.06.2026</td><td><a href="viewflight.php?flid='+id+'">D-TEST</a></td><td>10:00</td><td>10:10</td><td>00:10</td><td>'+(decorated?'Alpha<br>Beta<span hidden>hidden</span><style>.ignored{color:red}</style>':'Synthetic pilot')+'</td></tr>');
    const summary=total?'':'<tr class="summary"><td colspan="99">Zeitspanne: selected, Anz. Flüge: 0, Landungen: 0, Flugzeit:</td></tr>';
    const footer=total?'Datensatz '+first+' bis '+last+' von '+total:'Es wurden keine passenden Daten gefunden!<style>td.f1{width:100%!important}td.f2{width:0%!important}</style>';
    return '<form name="frm_tablelist_quickconfig"><select name="lst_configavailable"><option value="-1" selected>Konfiguration laden</option></select></form><div id="divpageheadermenu"><div></div><div>VEREINSFLIEGER.DE Synthetic account</div></div><form id="frmfilter"><input type="text" value=""><input type="checkbox" checked></form><select name="frm_rowsperpage"><option value="500" selected>500</option></select><span id="globalfilter">ab 01.01.2026 bis 31.12.2026</span><span id="globalfilter2">Pilot oder Fluglehrer</span><ul id="LST_VISIBLE">'+headers.map((h,i)=>'<li value="'+(i+1)+'">'+h+'</li>').join('')+'</ul><ul id="LST_AVAILABLE"></ul><div id="tablefixedcontainer"><table id="tablelist_20"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+summary+'<tr><td colspan="99">layout</td></tr></tbody></table><table class="tablelist"><tbody><tr><td class="footer f1">'+footer+'</td><td class="footer f2"></td></tr></tbody></table>'+(last<total?'<a class="pagebrowser" href="flightlog.php?page='+(number+1)+'">'+(number+1)+'</a>':'')+'</div>';
  };
  const checks=[],samples=[];
  for(const scenario of ['single','pagination','empty','text-parity','foreign-before','foreign-after','foreign-club','login-at-200','expiry-after','mime','redirect','oversize','network','cancel','stale-document']){
    const started=performance.now(),calls=[];let profiles=0,reply,html;
    const fake={ReactNativeWebView:{postMessage:s=>{reply=JSON.parse(s);}}};fake.top=fake;
    const location=new URL(base),total=scenario==='pagination'?501:scenario==='empty'?0:1;
    const fetch=async(url,options)=>{
      calls.push({url,method:options.method,credentials:options.credentials,redirect:options.redirect,cache:options.cache});
      const isProfile=new URL(url).pathname.endsWith('viewprofile');
      if(isProfile){profiles++;html=profile;if(scenario==='foreign-before'||scenario==='foreign-after'&&profiles%2===0)html=html.replace('<td>123</td>','<td>456</td>');if(scenario==='foreign-club')html=html.replace('Synthetic Club','Other Club');if(scenario==='expiry-after'&&profiles===2)html='<input id="pwinput" name="pwinput">';}
      else{html=page(Number(new URL(url).searchParams.get('page')||1),total,scenario==='text-parity');
        if(scenario==='login-at-200')html='<input id="pwinput" name="pwinput">';
        if(scenario==='network')throw Error('synthetic');
        if(scenario==='cancel'){fake.__moflightExportHttpAbort();throw Error('synthetic');}
        if(scenario==='stale-document')location.href=origin+'/member/profile/viewprofile';
        if(scenario==='oversize')html='x'.repeat(4000001);
      }
      const r=new Response(html,{headers:{'content-type':!isProfile&&scenario==='mime'?'application/json':'text/html; charset=utf-8'}});
      Object.defineProperty(r,'url',{value:!isProfile&&scenario==='redirect'?origin+'/':url});return r;
    };
    const read=async target=>await (function(window,location,fetch){return (${EXPORT_HTTP_SOURCE})('fixture',expected,request,'Synthetic account',target,(${HTTP_EXPORT_READER_SOURCE}),(${INERT_EXPORT_TEXT_SOURCE}));})(fake,location,fetch);
    await read(base);let rows=reply?.payload?.rows?.length||0,pages=reply?.payload?1:0;
    if(scenario==='pagination'&&reply?.payload?.nextUrl){const target=reply.payload.nextUrl;await read(target);rows+=reply?.payload?.rows?.length||0;pages++;}
    let ok;
    if(['single','pagination','empty','text-parity'].includes(scenario))ok=!!reply?.payload&&!reply.error&&rows===total&&pages===(total>500?2:1);
    else if(['mime','redirect','oversize','network'].includes(scenario))ok=reply?.error==='unsupported'&&reply.fallbackSafe===true;
    else if(scenario==='stale-document')ok=reply===undefined;
    else ok=!!reply?.error&&reply.fallbackSafe!==true;
    if(['single','empty','text-parity'].includes(scenario)&&reply?.payload){
      const mount=document.createElement('div');mount.style.cssText='position:absolute;left:-10000px;width:800px';mount.innerHTML=page(1,total,scenario==='text-parity');document.body.appendChild(mount);
      let dom;const w={ReactNativeWebView:{postMessage:s=>{dom=JSON.parse(s);}}};w.top=w;
      (function(window,document,location){(${EXPORT_DRIVER_SOURCE})('fixture','read',request,'Synthetic account',500);})(w,{querySelector:s=>mount.querySelector(s),querySelectorAll:s=>mount.querySelectorAll(s)},new URL(base));
      ok=ok&&JSON.stringify(dom)===JSON.stringify(reply.payload);mount.remove();
    }
    ok=ok&&calls.every(c=>c.url.startsWith(origin+'/member/profile/')&&c.method==='GET'&&c.credentials==='same-origin'&&c.redirect==='error'&&c.cache==='no-store');
    if(scenario==='foreign-before'||scenario==='foreign-club')ok=ok&&!calls.some(c=>c.url.includes('flightlog.php'));
    checks.push({scenario:'export-'+scenario,ok,requests:calls.length,rows,pages});
    samples.push({scenario:'export-'+scenario,elapsedMs:performance.now()-started,outcome:ok?'passed':'failed'});
  }
  return {checks,samples};
}`;
