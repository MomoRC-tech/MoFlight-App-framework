import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { chartOrder, type ChartKind } from './statistics-charts-model';
export interface ChartPreference { expanded: boolean; chart: ChartKind }
export const defaultChartPreference: ChartPreference = { expanded: true, chart: 'monthly' };
const writes = new Map<string, Promise<void>>();
async function key(scope: string) { return `moflight-charts-${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, scope)}`; }
export async function readChartPreference(scope: string): Promise<ChartPreference> {
  const raw = await SecureStore.getItemAsync(await key(scope));
  if (!raw) return { ...defaultChartPreference };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid chart preference');
  const p=value as Record<string,unknown>;
  if(typeof p.expanded!=='boolean'||!chartOrder.includes(p.chart as ChartKind))throw new Error('Invalid chart preference');
  return {expanded:p.expanded,chart:p.chart as ChartKind};
}
export async function saveChartPreference(scope: string, preference: ChartPreference): Promise<void> {
  const previous=writes.get(scope)??Promise.resolve();
  const pending=previous.catch(()=>{}).then(async()=>{await SecureStore.setItemAsync(await key(scope),JSON.stringify(preference));});
  writes.set(scope,pending);
  try {await pending;} finally {if(writes.get(scope)===pending)writes.delete(scope);}
}
