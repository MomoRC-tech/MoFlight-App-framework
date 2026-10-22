import { canonical } from '@moflight/flight-logbook';
import { loadProviderScope } from './scoped-storage';
import { createDutyRosterSnapshot } from './duties';
import { loadDutyRoster, saveDutyRoster } from './duty-native';
import type { InformationCapture } from './information';

/** Explicit foreground update. Unsupported/failed pages leave the prior cache intact. */
export async function refreshDutyRoster(owner: string, accountRef: string, ports: {
  active(): boolean;
  readPage(source: 'own' | 'club'): Promise<InformationCapture>;
}) {
  const scope = await loadProviderScope(owner);
  if (!scope || scope.owner !== owner || scope.context.accountNumber !== accountRef) throw new Error('Duty scope unavailable');
  const gate = () => { if (!ports.active()) throw new Error('Duty update expired'); };
  gate();
  const own = await ports.readPage('own'); gate();
  const club = await ports.readPage('club'); gate();
  const current = await loadProviderScope(owner); gate();
  if (canonical(scope) !== canonical(current)) throw new Error('Duty scope changed');
  const snapshot = createDutyRosterSnapshot(scope, [own, club], new Date().toISOString());
  await saveDutyRoster(scope, snapshot, gate);
  const saved = await loadDutyRoster(scope, gate); gate();
  if (canonical(saved) !== canonical(snapshot)) throw new Error('Duty save not confirmed');
  // Existing source contract is visible-page only, even for zero rows.
  return { rows: [...own.rows, ...club.rows], partial: true as const };
}
