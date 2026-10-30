import type { ExpenseContribution, ExpenseFact, ExpenseIssue, ExpenseMoney, ExpensePeriod, ExpenseProjection,
  ExpenseScope, ExpenseSnapshot, UnversionedBilledFlightFact, UnversionedExpenseContribution,
  UnversionedExpenseProjection, UnversionedExpenseSnapshot } from './expense-types';

const kinds = ['flying', 'club', 'allowance-fee', 'unclassified', 'payment', 'payment-reversal', 'allowance-transfer', 'balance', 'unknown'];
const maxMinor = BigInt(Number.MAX_SAFE_INTEGER);
const unique = (values: readonly string[]) => [...new Set(values)].sort();
const scopeKey = (s: ExpenseScope) => JSON.stringify([s.ownerId, s.storeId, s.connectionId, s.accountRef, s.clubContext]);
const chargeKey = (f: { accountRef: string; chargeRef: string | null }) => JSON.stringify([f.accountRef, f.chargeRef]);
const safeMinor = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const asNumber = (n: bigint) => n > maxMinor || n < -maxMinor ? null : Number(n);
const expenseKind = (kind: string) => ['flying', 'club', 'allowance-fee', 'unclassified'].includes(kind);

function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error('Invalid expense fields.');
}
function text(value: unknown, limit = 200): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > limit || /[\u0000-\u001f]/.test(value)) {
    throw new Error('Invalid expense reference.');
  }
}
function refs(value: unknown, empty = false, limit = 32): string[] {
  if (!Array.isArray(value) || value.length > limit || !empty && !value.length) throw new Error('Invalid expense evidence.');
  for (const ref of value) text(ref, 256);
  return unique(value as string[]);
}
function readScope(value: unknown): ExpenseScope {
  exact(value, ['ownerId', 'storeId', 'connectionId', 'accountRef', 'clubContext']);
  for (const field of Object.values(value)) text(field);
  return { ownerId: value.ownerId as string, storeId: value.storeId as string, connectionId: value.connectionId as string,
    accountRef: value.accountRef as string, clubContext: value.clubContext as string };
}
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
}
function requestedPeriod(request: ExpensePeriod): ExpenseProjection['period'] {
  if (request.mode === 'custom') {
    exact(request, ['mode', 'from', 'through']);
    if (!validDate(request.from) || !validDate(request.through) || request.from > request.through) throw new Error('Invalid expense period.');
    return { ...request };
  }
  exact(request, request.mode === 'month' ? ['mode', 'year', 'month'] : ['mode', 'year']);
  if (!['month', 'year'].includes(request.mode) || !Number.isInteger(request.year) || request.year < 1900 || request.year > 2199) throw new Error('Invalid expense period.');
  if (request.mode === 'year') return { mode: 'year', from: `${request.year}-01-01`, through: `${request.year}-12-31` };
  if (!Number.isInteger(request.month) || request.month < 1 || request.month > 12) throw new Error('Invalid expense month.');
  const prefix = `${request.year}-${String(request.month).padStart(2, '0')}`;
  const last = new Date(Date.UTC(request.year, request.month, 0)).getUTCDate();
  return { mode: 'month', from: prefix + '-01', through: `${prefix}-${last}` };
}
function readFact(input: ExpenseFact, target: ExpenseScope): ExpenseFact {
  exact(input, ['scope', 'accountRef', 'chargeRef', 'revision', 'supersedes', 'role', 'kind', 'bookingDate', 'currency',
    'amountMinor', 'coveredMinor', 'liability', 'aircraftRef', 'relatedCharge', 'evidenceRefs']);
  const scope = readScope(input.scope);
  if (scopeKey(scope) !== scopeKey(target)) throw new Error('Foreign expense fact scope.');
  text(input.accountRef);
  for (const value of [input.chargeRef, input.aircraftRef]) if (value !== null) text(value);
  if (!['primary', 'supporting'].includes(input.role) || !kinds.includes(input.kind) || !['own', 'unknown'].includes(input.liability)) throw new Error('Unsupported expense interpretation.');
  for (const value of [input.bookingDate, input.currency]) if (value !== null && typeof value !== 'string') throw new Error('Invalid expense value type.');
  if (input.bookingDate !== null && input.bookingDate.length > 32 || input.currency !== null && input.currency.length > 8) throw new Error('Oversized expense value.');
  for (const value of [input.revision, input.supersedes, input.amountMinor, input.coveredMinor]) {
    if (value !== null && typeof value !== 'number') throw new Error('Invalid expense number type.');
  }
  if (input.relatedCharge !== null) {
    exact(input.relatedCharge, ['accountRef', 'chargeRef']); text(input.relatedCharge.accountRef); text(input.relatedCharge.chargeRef);
  }
  return { ...input, scope, evidenceRefs: refs(input.evidenceRefs), relatedCharge: input.relatedCharge ? { ...input.relatedCharge } : null };
}
function fingerprint(f: ExpenseFact) {
  return JSON.stringify([f.bookingDate, f.currency, f.amountMinor, f.kind, f.liability, f.aircraftRef,
    f.relatedCharge ? [f.relatedCharge.accountRef, f.relatedCharge.chargeRef] : null, f.supersedes]);
}

/** Pure, bounded calculation over already interpreted facts. This does not parse
 * provider text or authenticate a claimed mapping/identity/revision. No ordinary
 * app adapter supplies these facts yet; source acceptance remains a separate gate. */
export function projectExpenses(input: ExpenseSnapshot, targetInput: ExpenseScope, request: ExpensePeriod): ExpenseProjection;
export function projectExpenses(input: UnversionedExpenseSnapshot, targetInput: ExpenseScope, request: ExpensePeriod): UnversionedExpenseProjection;
export function projectExpenses(input: ExpenseSnapshot | UnversionedExpenseSnapshot, targetInput: ExpenseScope,
  request: ExpensePeriod): ExpenseProjection | UnversionedExpenseProjection {
  if (input?.version === 2) return projectUnversionedExpenses(input, targetInput, request);
  return projectVersionedExpenses(input, targetInput, request);
}

function projectVersionedExpenses(input: ExpenseSnapshot, targetInput: ExpenseScope, request: ExpensePeriod): ExpenseProjection {
  const target = readScope(targetInput), period = requestedPeriod(request), annual = period.mode === 'year';
  exact(input, ['version', 'scope', 'coverage', 'facts']);
  if (input.version !== 1 || scopeKey(readScope(input.scope)) !== scopeKey(target)) throw new Error('Foreign expense snapshot.');
  if (!Array.isArray(input.facts) || input.facts.length > 10_000) throw new Error('Expense snapshot exceeds its bound.');
  exact(input.coverage, ['state', 'from', 'through', 'evidenceRefs']);
  const coverage = input.coverage;
  if (!['unavailable', 'partial', 'complete'].includes(coverage.state)) throw new Error('Invalid expense coverage.');
  if ((coverage.from === null) !== (coverage.through === null) || coverage.from !== null &&
      (!validDate(coverage.from) || !validDate(coverage.through) || coverage.from > coverage.through)) throw new Error('Invalid expense coverage dates.');
  refs(coverage.evidenceRefs, coverage.state !== 'complete');
  if (coverage.state === 'complete' && coverage.from === null || coverage.state === 'unavailable' && input.facts.length) throw new Error('Contradictory expense coverage.');
  const facts = input.facts.map(f => readFact(f, target));
  const issues: ExpenseIssue[] = [], fundingIssues: ExpenseIssue[] = [], excluded: ExpenseProjection['excluded'] = [];
  const contributions: ExpenseContribution[] = [];
  const addIssue = (code: string, values: ExpenseFact[], funding = false) => (funding ? fundingIssues : issues).push({ code, evidenceRefs: unique(values.flatMap(f => f.evidenceRefs)) });
  const exclude = (reason: string, values: ExpenseFact[]) => excluded.push({ reason, evidenceRefs: unique(values.flatMap(f => f.evidenceRefs)) });
  const interested = (f: ExpenseFact) => (expenseKind(f.kind) || f.kind === 'unknown') && (annual || f.kind !== 'allowance-fee');
  const inside = (date: string) => date >= period.from && date <= period.through;
  const mightAffect = (values: ExpenseFact[]) => values.some(f => interested(f) && (!validDate(f.bookingDate) || inside(f.bookingDate)));
  const groups = new Map<string, ExpenseFact[]>();
  for (const f of facts) {
    if (f.chargeRef === null) {
      if (mightAffect([f])) addIssue('identity-unproved', [f]); else exclude(interested(f) ? 'outside-period' : 'nonexpense-or-annual-only', [f]);
      continue;
    }
    const key = chargeKey(f), group = groups.get(key) ?? []; group.push(f); groups.set(key, group);
  }
  for (const group of groups.values()) {
    const primary = group.filter(f => f.role === 'primary');
    if (!primary.length) { if (mightAffect(group)) addIssue('missing-authority', group); else exclude('nonexpense-or-outside-period', group); continue; }
    const relevant = mightAffect(primary);
    if (primary.some(f => !safeMinor(f.revision) || f.revision < 1 || f.supersedes !== null &&
        (!safeMinor(f.supersedes) || f.supersedes < 1 || f.supersedes >= f.revision))) {
      if (relevant) addIssue('revision-unproved', group); else exclude('nonexpense-or-outside-period', group); continue;
    }
    const versions = new Map<number, ExpenseFact[]>();
    for (const f of primary) { const version = versions.get(f.revision!) ?? []; version.push(f); versions.set(f.revision!, version); }
    if ([...versions.values()].some(v => new Set(v.map(fingerprint)).size > 1)) {
      if (relevant) addIssue('revision-conflict', group); else exclude('nonexpense-or-outside-period', group); continue;
    }
    const newest = Math.max(...versions.keys()), current = versions.get(newest)!, selected = current[0]!;
    const reached = new Set<number>(); let revision: number | null = newest;
    while (revision !== null && versions.has(revision)) {
      reached.add(revision); revision = versions.get(revision)![0]!.supersedes;
    }
    if ([...versions.keys()].some(v => !reached.has(v))) {
      if (relevant) addIssue('revision-conflict', group); else exclude('nonexpense-or-outside-period', group); continue;
    }
    if (!interested(selected)) { exclude(selected.kind === 'allowance-fee' ? 'annual-only' : selected.kind, group); continue; }
    if (!validDate(selected.bookingDate)) { addIssue('date-unavailable', group); continue; }
    if (!inside(selected.bookingDate)) { exclude('outside-period', group); continue; }
    if (selected.kind === 'unknown') { addIssue('kind-unavailable', group); continue; }
    if (selected.currency !== 'EUR') { addIssue(selected.currency === null ? 'currency-unavailable' : 'unsupported-currency', group); continue; }
    if (selected.liability !== 'own') { addIssue('liability-unavailable', group); continue; }
    if (!safeMinor(selected.amountMinor)) { addIssue('amount-unavailable', group); continue; }
    if (selected.amountMinor < 0 && selected.relatedCharge === null) { addIssue('unlinked-credit', group); continue; }
    let covered: number | null = null;
    if (selected.kind === 'flying') {
      const c = selected.coveredMinor, amount = selected.amountMinor;
      const conflictingCoverage = new Set(current.map(f => f.coveredMinor)).size !== 1;
      const valid = !conflictingCoverage && safeMinor(c) && (amount >= 0 ? c >= 0 && c <= amount : c <= 0 && c >= amount);
      if (valid) covered = c;
      else if (annual) addIssue(conflictingCoverage ? 'allowance-coverage-conflict' : 'allowance-coverage-unavailable', current, true);
    }
    contributions.push({ accountRef: selected.accountRef, chargeRef: selected.chargeRef!, revision: newest,
      kind: selected.kind, bookingDate: selected.bookingDate, amountMinor: selected.amountMinor,
      coveredMinor: covered, aircraftRef: selected.aircraftRef, relatedCharge: selected.relatedCharge,
      evidenceRefs: unique([...current, ...group.filter(f => f.role === 'supporting')].flatMap(f => f.evidenceRefs)),
      supersededEvidenceRefs: unique(primary.filter(f => f.revision !== newest).flatMap(f => f.evidenceRefs)) });
  }
  return summarizeExpenses(contributions, period, coverage, issues, fundingIssues, excluded);
}

/** Shared exact arithmetic; resolution of v1 revisions and v2 raw variants is
 * deliberately separate. No synthetic revision is needed for aggregation. */
function summarizeExpenses<C extends Omit<ExpenseContribution, 'revision'> & { revision: number | null }>(
  contributions: C[], period: ExpenseProjection['period'], coverage: ExpenseSnapshot['coverage'],
  issues: ExpenseIssue[], fundingIssues: ExpenseIssue[], excluded: ExpenseProjection['excluded'],
): Omit<ExpenseProjection, 'contributions'> & { contributions: C[] } {
  const annual = period.mode === 'year';
  contributions.sort((a, b) => chargeKey(a) < chargeKey(b) ? -1 : chargeKey(a) > chargeKey(b) ? 1 : 0);
  const sums = { flying: 0n, club: 0n, unclassified: 0n, fee: 0n, covered: 0n, extra: 0n };
  const aircraft = new Map<string | null, { sum: bigint; chargeKeys: string[] }>();
  for (const c of contributions) {
    const amount = BigInt(c.amountMinor);
    if (c.kind === 'flying') {
      sums.flying += amount;
      if (c.coveredMinor !== null) { sums.covered += BigInt(c.coveredMinor); sums.extra += amount - BigInt(c.coveredMinor); }
      const group = aircraft.get(c.aircraftRef) ?? { sum: 0n, chargeKeys: [] };
      group.sum += amount; group.chargeKeys.push(chargeKey(c)); aircraft.set(c.aircraftRef, group);
    } else if (c.kind === 'club') sums.club += amount;
    else if (c.kind === 'unclassified') sums.unclassified += amount;
    else if (c.kind === 'allowance-fee') sums.fee += amount;
  }
  const usage = sums.flying + sums.club + sums.unclassified, own = sums.extra + sums.club + sums.unclassified + sums.fee;
  const visibleSums = [sums.flying, sums.club, sums.unclassified, usage, ...[...aircraft.values()].map(a => a.sum),
    ...(annual ? [sums.fee, sums.covered, sums.extra, own] : [])];
  if (visibleSums.some(n => asNumber(n) === null)) issues.push({ code: 'overflow', evidenceRefs: unique(contributions.flatMap(c => c.evidenceRefs)) });
  const coveredPeriod = coverage.state === 'complete' && coverage.from !== null && coverage.through !== null &&
    coverage.from <= period.from && coverage.through >= period.through;
  if (!coveredPeriod) issues.push({ code: coverage.state === 'unavailable' ? 'source-unavailable' : 'coverage-partial', evidenceRefs: refs(coverage.evidenceRefs, true) });
  const complete = coveredPeriod && issues.length === 0, fundingComplete = complete && fundingIssues.length === 0;
  const money = (n: bigint, valid = complete): ExpenseMoney => ({ knownMinor: asNumber(n), totalMinor: valid ? asNumber(n) : null });
  const allIssues = [...issues, ...fundingIssues].sort((a, b) => {
    const x = JSON.stringify([a.code, a.evidenceRefs]), y = JSON.stringify([b.code, b.evidenceRefs]); return x < y ? -1 : x > y ? 1 : 0;
  });
  excluded.sort((a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; });
  return { period, dateBasis: 'booking-date', currency: 'EUR',
    state: coverage.state === 'unavailable' ? 'unavailable' : issues.some(i => i.code === 'revision-conflict') ? 'conflict' :
      complete && (!annual || fundingComplete) ? 'complete' : 'partial',
    flying: money(sums.flying), club: money(sums.club), unclassified: money(sums.unclassified), usageAndClub: money(usage),
    annual: annual ? { allowanceFee: money(sums.fee), covered: money(sums.covered, fundingComplete),
      extraFlying: money(sums.extra, fundingComplete), overallOwn: money(own, fundingComplete) } : null,
    aircraft: [...aircraft.entries()].sort(([a], [b]) => a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1)
      .map(([aircraftRef, value]) => ({ aircraftRef, amount: money(value.sum), chargeKeys: [...value.chargeKeys] })),
    contributions, excluded, issues: allIssues };
}

function readUnversionedFact(input: UnversionedBilledFlightFact, target: ExpenseScope): UnversionedBilledFlightFact {
  exact(input, ['scope', 'sourceFlightRef', 'sourceHash', 'revision', 'supersedes', 'invoiceIdentity', 'invoiceReference',
    'linkState', 'bookingDate', 'currency', 'amountMinor', 'liability', 'aircraftRef', 'blockingIssues', 'evidenceRefs']);
  const scope = readScope(input.scope);
  if (scopeKey(scope) !== scopeKey(target)) throw new Error('Foreign unversioned expense fact.');
  text(input.sourceFlightRef);
  if (typeof input.sourceHash !== 'string' || !/^[0-9a-f]{64}$/.test(input.sourceHash) || input.revision !== null || input.supersedes !== null) {
    throw new Error('Unversioned evidence cannot assert a source revision.');
  }
  for (const value of [input.invoiceIdentity, input.invoiceReference, input.aircraftRef]) if (value !== null) text(value);
  if (!['verified', 'unavailable', 'conflict'].includes(input.linkState) || !['own', 'unknown'].includes(input.liability)) throw new Error('Invalid unversioned authority.');
  for (const [value, limit] of [[input.bookingDate, 32], [input.currency, 8]] as const) {
    if (value !== null && (typeof value !== 'string' || value.length > limit)) throw new Error('Invalid unversioned source value.');
  }
  if (input.amountMinor !== null && typeof input.amountMinor !== 'number') throw new Error('Invalid unversioned amount.');
  return { ...input, scope, blockingIssues: refs(input.blockingIssues, true, 16), evidenceRefs: refs(input.evidenceRefs, false, 512) };
}

function projectUnversionedExpenses(input: UnversionedExpenseSnapshot, targetInput: ExpenseScope,
  request: ExpensePeriod): UnversionedExpenseProjection {
  const target = readScope(targetInput), period = requestedPeriod(request);
  exact(input, ['version', 'sourceBasis', 'scope', 'coverage', 'facts']);
  if (input.sourceBasis !== 'unversioned-billed-flight' || scopeKey(readScope(input.scope)) !== scopeKey(target)) throw new Error('Foreign unversioned expense snapshot.');
  exact(input.coverage, ['state', 'from', 'through', 'evidenceRefs']);
  const coverage = input.coverage;
  if (!['unavailable', 'partial'].includes(coverage.state) || (coverage.from === null) !== (coverage.through === null) ||
      coverage.from !== null && (!validDate(coverage.from) || !validDate(coverage.through) || coverage.from > coverage.through)) throw new Error('Invalid provisional coverage.');
  refs(coverage.evidenceRefs, true);
  if (!Array.isArray(input.facts) || input.facts.length > 10_000 || coverage.state === 'unavailable' && input.facts.length) throw new Error('Invalid unversioned fact coverage.');
  const facts = input.facts.map(fact => readUnversionedFact(fact, target));
  const groups = new Map<string, UnversionedBilledFlightFact[]>();
  for (const fact of facts) { const group = groups.get(fact.sourceFlightRef) ?? []; group.push(fact); groups.set(fact.sourceFlightRef, group); }
  const contributions: UnversionedExpenseContribution[] = [], issues: ExpenseIssue[] = [];
  const excluded: ExpenseProjection['excluded'] = [], blockedAircraft = new Set<string | null>();
  let blocked = false, conflict = false;
  const inside = (date: string) => date >= period.from && date <= period.through;
  for (const group of groups.values()) {
    const evidenceRefs = unique(group.flatMap(fact => fact.evidenceRefs));
    if (!group.some(fact => !validDate(fact.bookingDate) || inside(fact.bookingDate))) {
      excluded.push({ reason: 'outside-period', evidenceRefs }); continue;
    }
    const block = (code: string, isConflict = false) => {
      blocked = true; conflict ||= isConflict;
      for (const fact of group) blockedAircraft.add(fact.aircraftRef);
      issues.push({ code, evidenceRefs });
    };
    if (group.length > 20) { block('history-limit'); continue; }
    if (new Set(group.map(fact => fact.sourceHash)).size > 1) { block('source-variant-conflict', true); continue; }
    if (group.some(fact => fact.linkState === 'conflict')) { block('invoice-link-conflict', true); continue; }
    if (group.some(fact => fact.linkState !== 'verified' || fact.invoiceIdentity === null || fact.invoiceReference === null)) {
      block('invoice-link-unavailable'); continue;
    }
    const fingerprints = new Set(group.map(fact => JSON.stringify([fact.sourceHash, fact.invoiceIdentity, fact.invoiceReference,
      fact.linkState, fact.bookingDate, fact.currency, fact.amountMinor, fact.liability, fact.aircraftRef, fact.blockingIssues])));
    if (fingerprints.size > 1) { block('source-variant-conflict', true); continue; }
    const selected = group[0]!;
    if (selected.blockingIssues.length) { for (const issue of selected.blockingIssues) block(issue); continue; }
    if (!validDate(selected.bookingDate)) { block('date-unavailable'); continue; }
    if (selected.currency !== 'EUR') { block(selected.currency === null ? 'currency-unavailable' : 'unsupported-currency'); continue; }
    if (selected.liability !== 'own') { block('liability-unavailable'); continue; }
    if (!safeMinor(selected.amountMinor)) { block('amount-unavailable'); continue; }
    if (selected.amountMinor < 0) { block('credit-relation-unproved'); continue; }
    contributions.push({ sourceBasis: 'unversioned-billed-flight', accountRef: 'billed-flight-view', chargeRef: selected.sourceFlightRef,
      revision: null, kind: 'flying', bookingDate: selected.bookingDate, amountMinor: selected.amountMinor, coveredMinor: null,
      aircraftRef: selected.aircraftRef, relatedCharge: null, evidenceRefs, supersededEvidenceRefs: [] });
  }
  issues.push({ code: 'unversioned-source-provisional', evidenceRefs: refs(coverage.evidenceRefs, true) });
  const result = summarizeExpenses(contributions, period, coverage, issues, [], excluded);
  const unknown = (): ExpenseMoney => ({ knownMinor: null, totalMinor: null });
  const aircraft = result.aircraft.map(group => ({ ...group, amount: blockedAircraft.has(group.aircraftRef) ? unknown() : group.amount }));
  for (const aircraftRef of blockedAircraft) if (!aircraft.some(group => group.aircraftRef === aircraftRef)) {
    aircraft.push({ aircraftRef, amount: unknown(), chargeKeys: [] });
  }
  aircraft.sort((a, b) => a.aircraftRef === b.aircraftRef ? 0 : a.aircraftRef === null ? 1 : b.aircraftRef === null ? -1 : a.aircraftRef < b.aircraftRef ? -1 : 1);
  return { ...result, sourceBasis: 'unversioned-billed-flight',
    state: conflict ? 'conflict' : contributions.length || blocked ? 'partial' : 'unavailable',
    flying: blocked || !contributions.length ? unknown() : result.flying,
    club: unknown(), unclassified: unknown(), usageAndClub: unknown(), aircraft,
    annual: period.mode === 'year' ? { allowanceFee: unknown(), covered: unknown(), extraFlying: unknown(), overallOwn: unknown() } : null };
}
