import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncConfirmation } from '../../apps/platform-lab/src/mobile/sync-confirmation.ts';

test('confirmation requires one explicit decision for an allowed matching scope', () => {
  const gate=createSyncConfirmation();
  assert.equal(gate.request('a',false),null);
  const first=gate.request('a',true)!;
  assert.equal(gate.request('a',true),null);
  assert.equal(first.confirm('a',true),true);
  assert.equal(first.confirm('a',true),false);
});

test('cancel, dismissal, invalidation, changed scope and busy reject late confirmation', () => {
  for(const cause of ['cancel','invalidate','scope','busy']) {
    const gate=createSyncConfirmation(), ticket=gate.request('a',true)!;
    if(cause==='cancel')ticket.cancel();
    if(cause==='invalidate')gate.invalidate();
    assert.equal(ticket.confirm(cause==='scope'?'b':'a',cause!=='busy'),false,cause);
    const next=gate.request('a',true)!;
    ticket.cancel();
    assert.equal(ticket.confirm('a',true),false);
    assert.equal(next.confirm('a',true),true,'old callback cannot consume a new decision');
  }
});
