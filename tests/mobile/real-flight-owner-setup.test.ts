import assert from 'node:assert/strict';
import test from 'node:test';
import { continueRealFlightOwnerSetup, type RealFlightOwnerSetupPorts, type RealFlightSetupInspection, type RealFlightSetupOwner } from '../../apps/platform-lab/src/vereinsflieger/real-flight-owner-setup';

const owner: RealFlightSetupOwner = {
  ownerId: 'owner-1', storeId: 'store-1', candidateName: 'moflight-real-history-owner-1.sqlite',
  createdAt: '2026-10-20T10:00:00.000Z', selectedAt: '2026-10-20T10:00:00.000Z',
};
class UninitializedStoreError extends Error {}

function candidate(snapshot = { manifest: {
  singleton: 1, family: 'moflight-real-flight-history', schema_version: 1, payload_version: 1,
  owner_id: owner.ownerId, store_id: owner.storeId, created_at: owner.createdAt,
}, generation: 0, receipts: [] as unknown[] }, calls: string[] = []) {
  return { snapshot: async () => snapshot, close: async () => { calls.push('candidate.close'); } };
}

function emptyInspection(): RealFlightSetupInspection {
  return { state: 'empty', selected: null, preparations: [] };
}

function selectedInspection(name = owner.candidateName, recoveryRequired = false, calls: string[] = []): RealFlightSetupInspection {
  return { state: recoveryRequired ? 'recovery-required' : 'selected', selected: {
    name, recoveryRequired, candidate: { close: async () => { calls.push('selected.close'); } },
  }, preparations: [] };
}

function ports(overrides: Partial<RealFlightOwnerSetupPorts> = {}, calls: string[] = []): RealFlightOwnerSetupPorts {
  return {
    openCandidate: async () => { calls.push('candidate.open'); return candidate(undefined, calls); },
    isMissingCandidate: () => false,
    isUninitializedStore: () => false,
    resumeInitialCandidate: async () => { calls.push('candidate.resume-initial'); return candidate(undefined, calls); },
    openSelection: async create => { calls.push(`selection.open:${create}`); return {
      inspect: async () => { calls.push('selection.inspect'); return emptyInspection(); },
      activate: async (_id, name, previous, at) => { calls.push(`selection.activate:${name}:${previous}:${at}`); return 1; },
      close: async () => { calls.push('selection.close'); },
    }; },
    openCommandJournal: async create => { calls.push(`command.open:${create}`); return { close: async () => { calls.push('command.close'); } }; },
    uuid: () => 'activation-1',
    ...overrides,
  };
}

test('explicitly resumes an empty selected owner by creating only its missing original candidate and journals', async () => {
  const calls: string[] = [];
  let activated = false;
  const result = await continueRealFlightOwnerSetup(owner, ports({
    openCandidate: async () => { calls.push('candidate.open'); throw new Error('missing'); },
    isMissingCandidate: error => error instanceof Error && error.message === 'missing',
    openSelection: async create => { calls.push(`selection.open:${create}`); return {
      inspect: async () => { calls.push('selection.inspect'); return activated ? selectedInspection(owner.candidateName, false, calls) : emptyInspection(); },
      activate: async (_id, name, previous, at) => { calls.push(`selection.activate:${name}:${previous}:${at}`); activated = true; return 1; },
      close: async () => { calls.push('selection.close'); },
    }; },
    openCommandJournal: async create => {
      calls.push(`command.open:${create}`);
      return create ? { close: async () => { calls.push('command.close'); } } : null;
    },
  }, calls), true);
  assert.equal(result, true);
  assert.deepEqual(calls, [
    'selection.open:false', 'selection.inspect', 'candidate.open', 'candidate.resume-initial', 'candidate.close',
    'selection.activate:moflight-real-history-owner-1.sqlite:null:2026-10-20T10:00:00.000Z',
    'selection.inspect', 'selected.close', 'selection.close', 'command.open:false', 'command.open:true', 'command.close',
  ]);
});

test('does not replace an existing unreadable candidate when the selection journal is empty', async () => {
  const calls: string[] = [];
  await assert.rejects(continueRealFlightOwnerSetup(owner, ports({
    openCandidate: async () => { calls.push('candidate.open'); throw new Error('existing candidate is unreadable'); },
    isMissingCandidate: () => false,
  }, calls), true), /existing candidate is unreadable/);
  assert.equal(calls.includes('candidate.resume-initial'), false);
  assert.equal(calls.some(call => call.startsWith('selection.activate:')), false);
  assert.equal(calls.includes('command.open:false'), false);
  assert.equal(calls.at(-1), 'selection.close');
});

test('continues an already selected owner without reactivating it and creates only a missing command journal', async () => {
  const calls: string[] = [];
  const result = await continueRealFlightOwnerSetup(owner, ports({
    openSelection: async create => { calls.push(`selection.open:${create}`); return {
      inspect: async () => { calls.push('selection.inspect'); return selectedInspection('restored-candidate.sqlite', true, calls); },
      activate: async () => { calls.push('selection.activate'); return 2; },
      close: async () => { calls.push('selection.close'); },
    }; },
    openCommandJournal: async create => {
      calls.push(`command.open:${create}`);
      return create ? { close: async () => { calls.push('command.close'); } } : null;
    },
  }, calls), true);
  assert.equal(result, true);
  assert.equal(calls.includes('candidate.open'), false);
  assert.equal(calls.includes('selection.activate'), false);
  assert.deepEqual(calls.slice(-4), ['selection.close', 'command.open:false', 'command.open:true', 'command.close']);
  assert.equal(calls.includes('selected.close'), true);
});

test('read-only startup detection never creates missing setup files', async () => {
  const calls: string[] = [];
  const result = await continueRealFlightOwnerSetup(owner, ports({
    openSelection: async create => { calls.push(`selection.open:${create}`); return create ? null : null; },
    resumeInitialCandidate: async () => { calls.push('candidate.resume-initial'); return candidate(); },
    openCommandJournal: async create => { calls.push(`command.open:${create}`); return null; },
  }, calls), false);
  assert.equal(result, false);
  assert.deepEqual(calls, ['selection.open:false']);
});

test('refuses to activate a nonempty registered candidate under an empty selection', async () => {
  const calls: string[] = [];
  await assert.rejects(continueRealFlightOwnerSetup(owner, ports({
    openCandidate: async () => { calls.push('candidate.open'); return candidate({
      manifest: { singleton: 1, family: 'moflight-real-flight-history', schema_version: 1, payload_version: 1,
        owner_id: owner.ownerId, store_id: owner.storeId, created_at: owner.createdAt }, generation: 1, receipts: [{}],
    }, calls); },
  }, calls), true), /not empty/);
  assert.equal(calls.some(call => call.startsWith('selection.activate:')), false);
  assert.equal(calls.includes('command.open:false'), false);
});

test('initializes only typed empty reserved journals during explicit selected-owner resume', async () => {
  const calls: string[] = [];
  let activated = false;
  const result = await continueRealFlightOwnerSetup(owner, ports({
    isUninitializedStore: error => error instanceof UninitializedStoreError,
    openSelection: async create => {
      calls.push(`selection.open:${create}`);
      if (!create) throw new UninitializedStoreError('selection');
      return {
        inspect: async () => { calls.push('selection.inspect'); return activated ? selectedInspection(owner.candidateName, false, calls) : emptyInspection(); },
        activate: async () => { calls.push('selection.activate'); activated = true; return 1; },
        close: async () => { calls.push('selection.close'); },
      };
    },
    openCommandJournal: async create => {
      calls.push(`command.open:${create}`);
      if (!create) throw new UninitializedStoreError('command');
      return { close: async () => { calls.push('command.close'); } };
    },
  }, calls), true);
  assert.equal(result, true);
  assert.deepEqual(calls.slice(0, 3), ['selection.open:false', 'selection.open:true', 'selection.inspect']);
  assert.equal(calls.includes('selection.activate'), true);
  assert.deepEqual(calls.slice(-3), ['command.open:false', 'command.open:true', 'command.close']);
});

test('resumes a strictly empty registered candidate but does not replace it as a new candidate', async () => {
  const calls: string[] = [];
  let activated = false;
  const result = await continueRealFlightOwnerSetup(owner, ports({
    isUninitializedStore: error => error instanceof UninitializedStoreError,
    openCandidate: async name => { calls.push(`candidate.open:${name}`); throw new UninitializedStoreError('candidate'); },
    resumeInitialCandidate: async () => { calls.push('candidate.resume-initial'); return candidate(undefined,calls); },
    openSelection: async create => { calls.push(`selection.open:${create}`); return {
      inspect: async () => { calls.push('selection.inspect'); return activated ? selectedInspection(owner.candidateName,false,calls) : emptyInspection(); },
      activate: async () => { calls.push('selection.activate'); activated=true; return 1; },
      close: async () => { calls.push('selection.close'); },
    }; },
  },calls), true);
  assert.equal(result, true);
  assert.equal(calls.includes('candidate.resume-initial'),true);
  assert.equal(calls.includes('candidate.create'),false);
  assert.equal(calls.includes('selection.activate'),true);
});

test('readiness check treats typed empty reservations as incomplete without initializing them', async () => {
  const calls: string[] = [];
  const result = await continueRealFlightOwnerSetup(owner, ports({
    isUninitializedStore: error => error instanceof UninitializedStoreError,
    openSelection: async create => { calls.push(`selection.open:${create}`); throw new UninitializedStoreError('selection'); },
  },calls), false);
  assert.equal(result,false);
  assert.deepEqual(calls,['selection.open:false']);
});

test('routes an initialized unreadable selection with a prepared restore to explicit recovery without creating stores', async () => {
  const calls: string[] = [];
  const result = await continueRealFlightOwnerSetup(owner, ports({
    openSelection: async create => {
      calls.push(`selection.open:${create}`);
      return {
        inspect: async () => { calls.push('selection.inspect'); return {
          state:'unreadable', selected:null, warning:'No readable selected history.',
          preparations:[{status:'pending'}],
        }; },
        activate: async () => { calls.push('selection.activate'); return 1; },
        close: async () => { calls.push('selection.close'); },
      };
    },
    openCommandJournal: async create => { calls.push(`command.open:${create}`); return { close: async () => { calls.push('command.close'); } }; },
  },calls), false);
  assert.equal(result,true);
  assert.deepEqual(calls,['selection.open:false','selection.inspect','selection.close','command.open:false','command.close']);
});

test('routes an initialized unreadable selection without preparations when the existing command journal is readable', async () => {
  const calls: string[] = [];
  const result = await continueRealFlightOwnerSetup(owner, ports({
    openSelection: async create => {
      calls.push(`selection.open:${create}`);
      return {
        inspect: async () => { calls.push('selection.inspect'); return {
          state:'unreadable', selected:null, warning:'No readable selected history.', preparations:[],
        }; },
        activate: async () => { calls.push('selection.activate'); return 1; },
        close: async () => { calls.push('selection.close'); },
      };
    },
    openCommandJournal: async create => { calls.push(`command.open:${create}`); return { close: async () => { calls.push('command.close'); } }; },
  },calls), false);
  assert.equal(result,true);
  assert.deepEqual(calls,['selection.open:false','selection.inspect','selection.close','command.open:false','command.close']);
  assert.equal(calls.includes('candidate.resume-initial'),false);
  assert.equal(calls.includes('selection.activate'),false);
});

test('does not create a missing command journal merely to route an unreadable selection', async () => {
  const calls: string[] = [];
  const result = await continueRealFlightOwnerSetup(owner, ports({
    openSelection: async create => {
      calls.push(`selection.open:${create}`);
      return {
        inspect: async () => { calls.push('selection.inspect'); return {
          state:'unreadable', selected:null, warning:'No readable selected history.', preparations:[],
        }; },
        activate: async () => { calls.push('selection.activate'); return 1; },
        close: async () => { calls.push('selection.close'); },
      };
    },
    openCommandJournal: async create => { calls.push(`command.open:${create}`); return create ? { close: async () => { calls.push('command.close'); } } : null; },
  },calls), true);
  assert.equal(result,false);
  assert.deepEqual(calls,['selection.open:false','selection.inspect','selection.close','command.open:false']);
});

test('routes an empty selection with a prepared restore without activating the original candidate', async () => {
  const calls: string[] = [];
  const result = await continueRealFlightOwnerSetup(owner, ports({
    openSelection: async create => {
      calls.push(`selection.open:${create}`);
      return {
        inspect: async () => { calls.push('selection.inspect'); return {
          state:'empty', selected:null, preparations:[{status:'pending'}],
        }; },
        activate: async () => { calls.push('selection.activate'); return 1; },
        close: async () => { calls.push('selection.close'); },
      };
    },
    openCommandJournal: async create => { calls.push(`command.open:${create}`); return { close: async () => { calls.push('command.close'); } }; },
  },calls), false);
  assert.equal(result,true);
  assert.deepEqual(calls,['selection.open:false','selection.inspect','selection.close','command.open:false','command.close']);
  assert.equal(calls.includes('candidate.resume-initial'),false);
  assert.equal(calls.includes('selection.activate'),false);
});

test('startup hands off selected handles only after command readiness, preserving recovery warnings and one cleanup', async()=>{
  const calls:string[]=[];let release:(()=>Promise<void>)|undefined;
  const inspection=selectedInspection('retained.sqlite',true,calls);
  assert.ok(inspection.selected);inspection.selected.warning='Retained read-only recovery';
  const ready=await continueRealFlightOwnerSetup(owner,ports({openSelection:async()=>({
    inspect:async()=>inspection,activate:async()=>{throw new Error('No activation expected');},close:async()=>{calls.push('selection.close');},
  })},calls),false,(selected,close)=>{
    assert.equal(selected,inspection.selected);assert.equal(selected.recoveryRequired,true);assert.equal(selected.warning,'Retained read-only recovery');
    assert.ok(calls.includes('command.close'));assert.equal(calls.includes('selected.close'),false);release=close;
  });
  assert.equal(ready,true);assert.ok(release);assert.equal(calls.includes('selection.close'),false);
  await release();await release();
  assert.equal(calls.filter(x=>x==='selected.close').length,1);assert.equal(calls.filter(x=>x==='selection.close').length,1);
});

test('failed or missing command readiness closes startup handles without publishing a handoff',async()=>{
  for(const fail of [false,true]){
    const calls:string[]=[];let transfers=0;
    const result=continueRealFlightOwnerSetup(owner,ports({
      openSelection:async()=>({inspect:async()=>selectedInspection(undefined,false,calls),activate:async()=>1,close:async()=>{calls.push('selection.close');}}),
      openCommandJournal:async()=>{if(fail)throw new Error('Unreadable command journal');return null;},
    },calls),false,()=>{transfers++;});
    if(fail)await assert.rejects(result,/Unreadable command/);else assert.equal(await result,false);
    assert.equal(transfers,0);assert.deepEqual(calls,['selected.close','selection.close']);
  }
});

test('a rejected startup transfer closes both handles and unreadable restore routing never transfers',async()=>{
  const calls:string[]=[];
  await assert.rejects(continueRealFlightOwnerSetup(owner,ports({
    openSelection:async()=>({inspect:async()=>selectedInspection(undefined,false,calls),activate:async()=>1,close:async()=>{calls.push('selection.close');}}),
  },calls),false,()=>{throw new Error('Unmounted receiver');}),/Unmounted receiver/);
  assert.deepEqual(calls.slice(-2),['selected.close','selection.close']);
  let transfers=0;
  const ready=await continueRealFlightOwnerSetup(owner,ports({
    openSelection:async()=>({inspect:async()=>({state:'unreadable',selected:null,warning:'Recovery',preparations:[{status:'pending'}]}),activate:async()=>1,close:async()=>{}}),
  }),false,()=>{transfers++;});
  assert.equal(ready,true);assert.equal(transfers,0);
});
