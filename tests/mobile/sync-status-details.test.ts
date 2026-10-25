import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createSessionPresentation } from '../../apps/platform-lab/src/mobile/data-update-presentation.ts';
import { dataUpdateStatus } from '../../apps/platform-lab/src/mobile/data-freshness.ts';

test('visible status separates recent login proof, older saved receipt, count advice and read failure', () => {
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/SyncStatusDetails.tsx',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false},
  }).outputText;
  const react={createElement:(_type:unknown,_props:unknown,...children:any[]):any=>children, useMemo:(make:()=>unknown)=>make()};
  const modules:Record<string,unknown>={react:{default:react,...react},'./theme':{Label:'Label'},
    './data-update-presentation':{createSessionPresentation},'./data-freshness':{dataUpdateStatus}};
  const exports:any={};runInNewContext(source,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  const now=Date.parse('2026-10-25T12:00:00.000Z'),receivedAt='2026-10-20T12:00:00.000Z';
  const props={scopeKey:'owner/store/account',connection:{phase:'observed',confirmed:true,lastCheckedAt:new Date(now).toISOString(),
    observed:{accountNumber:'123',clubLabel:'Synthetic',clubIdentity:'display-label-only',verification:'observed-profile-number'}},
    receivedAt,readState:'ready',now,activityChanged:true};
  const text=(extra:any={})=>exports.SyncStatusDetails({...props,...extra}).flat(Infinity).filter((v:any)=>typeof v==='string').join(' ');
  assert.match(text(),/Angemeldet.*Zuletzt bestätigt/);
  assert.ok(text().includes(new Date(receivedAt).toLocaleString('de-DE')));
  assert.match(text(),/Änderungen möglich.*bestätigt keine neuen Flüge/);
  assert.doesNotMatch(text({now:now+90_000}),/Angemeldet/);
  assert.doesNotMatch(text({scopeKey:null}),/Angemeldet/);
  assert.match(text({readState:'failed'}),/nicht.*gelesen/);
  assert.doesNotMatch(text({activityChanged:false}),/Änderungen möglich/);
});
