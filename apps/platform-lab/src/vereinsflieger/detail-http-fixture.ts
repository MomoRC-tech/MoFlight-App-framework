import { DETAIL_LABELS } from './details';
import { DETAIL_HTTP_SOURCE, INERT_DETAIL_READER } from './detail-http-poc';
import { REQUIRED_HEADERS } from './probe';
import { EXPORT_HTTP_FIXTURE_SOURCE } from './export-http-fixture';

/** Self-contained, synthetic HTML only. fetch is lexically replaced; no server,
 * cookie operation, provider session or remote resource is used by this proof. */
export function detailHttpFixtureHtml() {
  const data = {
    profile: '<nav id="topnavi"><a href="/member/community/main">Synthetic club</a></nav><table class="tablelist alternative"><tr><td>Benutzernummer</td><td>100</td></tr></table>',
    foreign: '<nav id="topnavi"><a href="/member/community/main">Synthetic club</a></nav><table class="tablelist alternative"><tr><td>Benutzernummer</td><td>200</td></tr></table>',
    list: '<table id="tablelist_20"><thead><tr><th>Datum</th><th>Lfz.</th><th>Start</th><th>Landung</th><th>Flugzeit</th></tr></thead><tbody><tr><td>01.01.2026</td><td><a href="/member/profile/viewflight.php?flid=123">D-TEST</a></td><td>10:00</td><td>10:30</td><td>00:30</td></tr></tbody></table>',
    detail: '<table class="view"><tr><th>Allgemeine Daten</th></tr><tr><td>Eintrag</td><td>123</td></tr><tr><th>Flugdaten</th></tr><tr><td>CallSign</td><td>D-TEST</td></tr><tr><td>Datum</td><td>01.01.2026</td></tr><tr><td>Flugzeit</td><td>00:30</td></tr><tr><th>Abrechnungsdaten</th></tr><tr><td>Kosten</td><td>excluded</td></tr></table>',
  };
  return `<!doctype html><meta name="viewport" content="width=device-width"><title>Synthetic HTTP proof</title><body><p>Synthetic WebView proof; no provider network.</p><script>
  (async()=>{
    const data=${JSON.stringify(data)},checks=[],samples=[],origin='https://vereinsflieger.de';
    const scenarios=['success','relative-link','larger-list','foreign-before','foreign-after','foreign-club','login-at-200','network','redirect','mime','oversize','charset','foreign-link','missing-list','cancel'];
    for(const scenario of scenarios){
      const calls=[],started=performance.now();let profiles=0,message=null;
      const document=new DOMParser().parseFromString(data.profile,'text/html'),location=new URL(origin+'/member/profile/viewprofile');
      const window={ReactNativeWebView:{postMessage:s=>{message=JSON.parse(s);}}};window.top=window;
      const fetch=async(url,options)=>{
        calls.push({url,options:{method:options.method,credentials:options.credentials,redirect:options.redirect,cache:options.cache}});
        if(scenario==='network')throw Error('synthetic');
        if(scenario==='cancel'){window.__moflightDetailHttpAbort();throw Error('synthetic');}
        const path=new URL(url).pathname;let html;
        if(path.endsWith('viewprofile')){profiles++;html=(scenario==='foreign-before'||scenario==='foreign-after'&&profiles===2)?data.foreign:data.profile;if(scenario==='foreign-club')html=html.replace('Synthetic club','Other club');}
        else if(path.endsWith('flightlog.php'))html=scenario==='missing-list'?'<p>unsupported</p>':scenario==='foreign-link'?data.list.replace('/member/profile/viewflight.php?flid=123','https://foreign.invalid/member/profile/viewflight.php?flid=999'):data.list;
        else if(path.endsWith('viewflight.php'))html=data.detail;
        else throw Error('unexpected synthetic request');
        if(scenario==='larger-list'&&path.endsWith('flightlog.php')){const row=data.list.slice(data.list.indexOf('<tbody>')+7,data.list.indexOf('</tbody>'));html=html.replace(row,row.repeat(25));}
        if(scenario==='relative-link'&&path.endsWith('flightlog.php'))html=html.replace('/member/profile/viewflight.php?flid=123','viewflight.php?flid=123');
        if(scenario==='login-at-200')html='<input id="pwinput" name="pwinput">';
        if(scenario==='oversize')html='x'.repeat(1000001);
        const response=new Response(html,{headers:{'content-type':scenario==='mime'?'application/json':scenario==='charset'?'text/html; charset=unsupported':'text/html; charset=utf-8'}});
        Object.defineProperty(response,'url',{value:scenario==='redirect'?origin+'/':url});
        return response;
      };
      await (${DETAIL_HTTP_SOURCE})('synthetic-'+scenario,{accountNumber:'100',clubLabel:'Synthetic club'},${JSON.stringify(DETAIL_LABELS)},${JSON.stringify(REQUIRED_HEADERS)},${INERT_DETAIL_READER});
      const success=scenario==='success'||scenario==='relative-link'||scenario==='larger-list';
      const fields=message?.result?.fields;
      const ok=success?!!(fields?.length===4&&fields[0].raw==='123'&&fields[1].raw==='D-TEST'&&calls.length===4&&message.detailUrl===origin+'/member/profile/viewflight.php?flid=123'):!!message?.error;
      checks.push({scenario,ok,requests:calls.length});samples.push({scenario,elapsedMs:performance.now()-started,outcome:ok?'passed':'failed'});
      if(calls.some(c=>c.options.method!=='GET'||c.options.credentials!=='same-origin'||c.options.redirect!=='error'||c.options.cache!=='no-store'))checks.push({scenario:'request-policy',ok:false});
      if(scenario==='foreign-link'&&calls.some(c=>c.url.includes('viewflight.php')))checks.push({scenario:'unobserved-id-not-requested',ok:false});
    }
    const exported=await (${EXPORT_HTTP_FIXTURE_SOURCE})();checks.push(...exported.checks);samples.push(...exported.samples);
    ReactNativeWebView.postMessage(JSON.stringify({kind:'vf-detail-http-synthetic-v1',checks,samples,passed:checks.every(c=>c.ok),userAgent:navigator.userAgent}));
  })().catch(()=>ReactNativeWebView.postMessage(JSON.stringify({kind:'vf-detail-http-synthetic-v1',passed:false,checks:[],samples:[]})));
  </script></body>`;
}
