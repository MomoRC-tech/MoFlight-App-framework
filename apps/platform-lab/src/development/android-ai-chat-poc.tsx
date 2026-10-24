import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { openRealFlightNativeDriver } from '../vereinsflieger/real-flight-native-driver';
import type { UpdateProofPorts } from './update-preservation-fixture';
import { seedAiChatProof, verifyAiChatProof, reopenAiChatProof } from './ai-chat-proof-fixture';

// Explicit synthetic entry override only. Never imported by the ordinary app.
let namespace = '', mode: 'seed' | 'verify' = 'verify';
export function configureUpdateProof(value: string, operation: 'seed' | 'verify') {
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(value) || !['seed', 'verify'].includes(operation)) throw new Error('Invalid chat proof configuration');
  namespace = value; mode = operation;
}
function file(value: string): File {
  if (!namespace || !/^[a-z][a-z0-9.-]+$/.test(value)) throw new Error('Invalid isolated chat proof path');
  const directory = /\.sqlite(?:-wal|-shm)?$/.test(value) ? SQLite.defaultDatabaseDirectory : Paths.document;
  return new File(typeof directory === 'string' && !directory.startsWith('file:') ? 'file://' + directory : directory, `ai-proof-${namespace}-${value}`);
}
async function track(value: string) {
  const manifest = file('owned.json');
  const names: unknown = manifest.exists ? JSON.parse(await manifest.text()) : [];
  if (!Array.isArray(names) || names.length > 100 || names.some(name => typeof name !== 'string' || !/^[a-z][a-z0-9.-]+$/.test(name))) throw new Error('Invalid isolated proof inventory');
  if (!names.includes(value)) {
    if (!manifest.exists) manifest.create({ overwrite: false });
    manifest.write(JSON.stringify([...names, value]));
  }
}
const ports: UpdateProofPorts = {
  async open(value) {
    await track(value);
    return openRealFlightNativeDriver(`ai-proof-${namespace}-${value}`, (path, options) => SQLite.openDatabaseAsync(path, options));
  },
  exists: async value => file(value).exists, read: value => file(value).text(),
  async write(value, text) { await track(value); const target = file(value); if (!target.exists) target.create({ overwrite: false }); target.write(text); },
  hash: text => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
};
async function cleanup() {
  const manifest = file('owned.json'), names: unknown = JSON.parse(await manifest.text());
  if (!Array.isArray(names) || names.length > 100) throw new Error('Invalid proof cleanup inventory');
  for (const name of names) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9.-]+$/.test(name)) throw new Error('Invalid proof cleanup name');
    for (const suffix of name.endsWith('.sqlite') ? ['', '-wal', '-shm'] : ['']) { const target = file(name + suffix); if (target.exists) target.delete(); }
  }
  manifest.delete();
}
let running = false;
export default function AiChatProof() {
  const [status, setStatus] = useState('UPDATE_PROOF_RUNNING chat');
  useEffect(() => {
    if (running) return; running = true;
    void (async () => {
      if (mode === 'seed') {
        await seedAiChatProof(ports);
        setStatus('UPDATE_PROOF_SEEDED chat owners=2 drafts=durable cap=50');
      } else if (await ports.exists('native-passed.json')) {
        await reopenAiChatProof(ports); await cleanup();
        setStatus('UPDATE_PROOF_REOPENED chat offline=passed cleanup=complete');
      } else {
        const result = await verifyAiChatProof(ports);
        await ports.write('native-passed.json', JSON.stringify(result));
        setStatus('UPDATE_PROOF_PASSED chat restore=complete late-reply=blocked owners=2');
      }
    })().catch(error => { console.error('Synthetic chat proof failed', error); setStatus('UPDATE_PROOF_FAILED ' + String(error)); });
  }, []);
  return <View style={{ padding: 24 }}><Text accessibilityLabel={status}>{status}</Text></View>;
}
