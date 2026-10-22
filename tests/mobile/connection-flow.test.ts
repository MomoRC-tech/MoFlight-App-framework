import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionFlow, type ConnectionFlow } from '../../apps/platform-lab/src/vereinsflieger/connection-flow';
import { ConnectionSession } from '../../apps/platform-lab/src/vereinsflieger/connection-state';

test('interactive form survives invalidation; verification hides it and cannot manufacture account proof', () => {
  const session = new ConnectionSession();
  let flow: ConnectionFlow = connectionFlow({phase:'idle'},{type:'show-login'});
  session.invalidate();
  flow=connectionFlow(flow,{type:'proof',state:session.state});
  assert.equal(flow.phase,'sign-in');
  session.start('fresh');
  flow=connectionFlow(flow,{type:'proof',state:session.state});
  assert.equal(flow.phase,'verifying');assert.equal(session.state.confirmed,false);
  session.fail('fresh','login-required');
  assert.equal(connectionFlow(flow,{type:'proof',state:session.state}).phase,'sign-in');
});

test('unconfirmed or foreign account cannot become connected; errors and cancellation remain actionable', () => {
  const session=new ConnectionSession();
  const context={accountNumber:'101',clubLabel:'Synthetic A',clubIdentity:'display-label-only',verification:'observed-profile-number'} as const;
  session.start('first');session.observe('first',context,'2026-10-22T12:00:00.000Z');
  assert.equal(connectionFlow({phase:'checking'},{type:'proof',state:session.state}).phase,'verifying');
  session.confirm();
  assert.equal(connectionFlow({phase:'verifying'},{type:'proof',state:session.state}).phase,'connected');
  session.start('foreign');session.observe('foreign',{...context,accountNumber:'202'},'2026-10-22T12:01:00.000Z');
  assert.deepEqual(connectionFlow({phase:'checking'},{type:'proof',state:session.state}),{phase:'error',reason:'account-mismatch'});
  const failed=connectionFlow({phase:'sign-in'},{type:'page-error'});
  session.invalidate();assert.deepEqual(connectionFlow(failed,{type:'proof',state:session.state}),failed);
  assert.equal(connectionFlow(failed,{type:'cancel'}).phase,'cancelled');
  assert.equal(connectionFlow(failed,{type:'show-login'}).phase,'sign-in');
});
