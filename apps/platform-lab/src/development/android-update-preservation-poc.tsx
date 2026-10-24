import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { canonical } from '@moflight/flight-logbook';
import { openRealFlightNativeDriver } from '../vereinsflieger/real-flight-native-driver';
import { seedUpdateProof, verifyUpdateProof, UPDATE_ACCOUNTS, type UpdateProofPorts } from './update-preservation-fixture';
import { UserBackupRestoreJournal, assertUserBackupReadAllowed } from '../user-backup-restore-journal';

/** Unimported by normal entry. All proof files use a fresh explicit namespace. */
let namespace = '', mode: 'seed' | 'verify' = 'verify';
export function configureUpdateProof(run: string, operation: 'seed' | 'verify') {
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(run) || !['seed', 'verify'].includes(operation)) throw new Error('Invalid upgrade proof configuration');
  namespace = run; mode = operation;
}
const hash = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
function name(value: string) {
  if (!namespace || !/^[a-z][a-z0-9.-]+$/.test(value)) throw new Error('Invalid isolated upgrade path');
  return `upgrade-proof-${namespace}-${value}`;
}
function file(value: string) {
  const folder = value.endsWith('.sqlite') ? SQLite.defaultDatabaseDirectory : Paths.document;
  return new File(typeof folder === 'string' && !folder.startsWith('file:') ? 'file://' + folder : folder, name(value));
}
const ports: UpdateProofPorts = {
  open: value => openRealFlightNativeDriver(name(value), (path, options) => SQLite.openDatabaseAsync(path, options)),
  exists: async value => file(value).exists,
  read: value => file(value).text(),
  async write(value, text) { const target = file(value); if (!target.exists) target.create({ overwrite: false }); target.write(text); }, hash,
};
const originals = [...UPDATE_ACCOUNTS.flatMap(a => [`${a.key}-real.sqlite`, `${a.key}-commands.sqlite`,
  `${a.key}-books.sqlite`, `${a.key}-information.sqlite`, `${a.key}-settings.json`, `${a.key}-attachment.txt`]),
  'restore.sqlite', 'expected.json', 'archive.json'];
async function fingerprints() {
  const values: Record<string, string> = {};
  for (const value of originals) values[value] = await hash(await file(value).base64());
  return values;
}
let running = false;
export default function UpdatePreservationProof() {
  const [status, setStatus] = useState('UPDATE_PROOF_RUNNING');
  useEffect(() => {
    if (running) return; running = true;
    void (async () => {
      if (mode === 'seed') {
        await seedUpdateProof(ports); await verifyUpdateProof(ports, false);
        await ports.write('fingerprints.json', canonical(await fingerprints()));
        await ports.write('result.json', canonical({ version: 1, status: 'seeded', owners: 2, books: 4, flights: 4, pending: 2, attachments: 2 }));
        setStatus('UPDATE_PROOF_SEEDED owners=2 books=4 flights=4 pending=2 attachments=2');
      } else {
        const before = await ports.read('fingerprints.json');
        const previous = JSON.parse(await ports.read('result.json')) as { status: string };
        if (previous.status === 'passed') {
          const current = await fingerprints(), initial = JSON.parse(before) as Record<string, string>;
          for (const value of originals.filter(value => value !== 'restore.sqlite')) {
            if (current[value] !== initial[value]) throw new Error('Offline restart changed a retained original');
          }
          await verifyUpdateProof(ports, false);
          await assertUserBackupReadAllowed(async () => UserBackupRestoreJournal.open(await ports.open('restore.sqlite'), false));
          setStatus('UPDATE_PROOF_REOPENED owners=2 books=4 flights=4 pending=2 attachments=2');
          return;
        }
        if (canonical(await fingerprints()) !== before) throw new Error('Upgrade file-byte mismatch before database reads');
        await verifyUpdateProof(ports);
        const after = await fingerprints(), initial = JSON.parse(before) as Record<string, string>;
        for (const value of originals.filter(value => value !== 'restore.sqlite')) {
          if (after[value] !== initial[value]) throw new Error('Recovery changed a retained original file');
        }
        await ports.write('result.json', canonical({ version: 1, status: 'passed', originalFiles: originals.length,
          byteEqualityBeforeRead: true, unchangedOriginalsAfterRecovery: originals.length - 1,
          owners: 2, books: 4, flights: 4, pending: 2, attachments: 2, aggregateRecovery: 'complete', idempotentRetry: true }));
        setStatus('UPDATE_PROOF_PASSED files=15 owners=2 books=4 flights=4 pending=2 attachments=2 recovery=complete');
      }
    })().catch(error => { console.error('Synthetic upgrade proof failed', error); setStatus('UPDATE_PROOF_FAILED ' + String(error)); });
  }, []);
  return <View style={{ padding: 24 }}><Text accessibilityLabel={status}>{status}</Text></View>;
}
