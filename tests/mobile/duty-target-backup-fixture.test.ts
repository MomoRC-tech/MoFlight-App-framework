import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as model from '../../apps/platform-lab/src/duty-target.ts';

test('native fixture attempts every saved-file cleanup and reports work plus cleanup errors',async()=>{
  const scope = {ownerId:'dadadada-1111-4111-8111-111111111111',storeId:'dadadada-2222-4222-8222-222222222222',accountRef:'999990001'};
  const rows = [{scope,year:2024},{scope,year:2025},{scope,year:2026},{scope:{...scope,accountRef:'999990002'},year:2026},
    {scope:{...scope,storeId:'dadadada-3333-4333-8333-333333333333'},year:2026},{scope:{...scope,ownerId:'dadadada-4444-4444-8444-444444444444'},year:2026}];
  const hash = async(text:string)=>createHash('sha256').update(text).digest('hex');
  const files = new Map<string,string>();
  for(const row of rows)files.set(`cockpit-duty-${await hash(model.dutyTargetKey(model.dutyTargetScopeKey(row.scope),row.year))}.json`,'preserved synthetic bytes');
  const expected=[...files.keys()].reverse(),attempted:string[]=[];
  let cleanupFailure=true;
  class File {
    name:string;constructor(_root:unknown,name:string){this.name=name;}
    get exists(){return files.has(this.name);}
    async text(){return files.get(this.name)!;}
    delete(){files.delete(this.name);}
    write(value:string){attempted.push(this.name);if(cleanupFailure){cleanupFailure=false;throw Error('synthetic cleanup write failure');}files.set(this.name,value);}
  }
  const modules:Record<string,unknown>={
    'expo-file-system':{File,Paths:{document:'synthetic'}},'../storage':{hash},'../duty-target':model,
    '../duty-target-native':{async saveDutyTargetNative(){throw Error('synthetic work failure');}},
    '../user-backup-restore-journal-native':{async assertNoPendingUserBackupRestore(){}},
  };
  const source=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/development/duty-target-backup-fixture.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const api={} as typeof import('../../apps/platform-lab/src/development/duty-target-backup-fixture.ts');
  runInNewContext(source,{exports:api,AggregateError,require:(id:string)=>{assert.ok(id in modules,id);return modules[id];}});
  await assert.rejects(api.runDutyTargetBackupFixture(),(error:unknown)=>{
    assert.ok(error instanceof AggregateError);assert.equal(error.errors.length,2);
    assert.match(String(error.errors[0]),/work failure/);assert.match(String(error.errors[1]),/cleanup write failure/);return true;
  });
  assert.deepEqual(attempted,expected);
  // A failed checkpoint must release the fixture's duplicate-run guard too.
  await assert.rejects(api.runDutyTargetBackupFixture(),/synthetic work failure/);
});
