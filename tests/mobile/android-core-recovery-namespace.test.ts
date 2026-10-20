import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveryPathNamespace, recoveryFileName } from '../../apps/platform-lab/src/development/android-core-recovery-fixture';

test('isolated recovery runs use validated distinct filenames for progress, commands, backup and every SQLite case', () => {
  const names=['native-recovery-progress-v1.json','native-recovery-restore-record-backup.json',
    ...(['after-facts','after-commit','restore-record'] as const).flatMap(kind=>[
      `native-recovery-${kind}-expected-command.json`,
      ...(['library','commands','candidate'] as const).map(db=>recoveryFileName(kind,db)),
    ])];
  const first=recoveryPathNamespace('driver-reuse-a'),second=recoveryPathNamespace('driver-reuse-b');
  assert.equal(new Set([...names,...names.map(first),...names.map(second)]).size,names.length*3);
  for(const name of names)assert.equal(first(name),'driver-reuse-a-'+name);
  for(const name of ['','../private','run/path','run\\path','x'.repeat(41),"a'bad",'a\nb'])assert.throws(()=>recoveryPathNamespace(name),/Invalid/);
  for(const name of ['../native-recovery-test.sqlite','owner-registry.sqlite','native-recovery-/other.sqlite'])assert.throws(()=>first(name),/Invalid/);
});
