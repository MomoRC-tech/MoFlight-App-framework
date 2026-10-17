/** Review metadata only; never an ownership assertion or a replayable journal. */
export interface LegacyReviewMetadata {
  status: 'present'; version: 2; accountLabel: string; preset: string;
  period: string; role: string; reset: boolean; journalFingerprint: string;
}
export type LegacyReview = { status: 'absent' } | LegacyReviewMetadata;
export function parseLegacyReview(input: unknown): LegacyReview {
  const v = input as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Legacy review unavailable.');
  if (v.status === 'absent' && Object.keys(v).length === 1) return { status: 'absent' };
  const fields = ['status', 'version', 'accountLabel', 'preset', 'period', 'role', 'reset', 'journalFingerprint'];
  const text = (key: string, max: number) => typeof v[key] === 'string' && !!(v[key] as string).trim() && (v[key] as string).length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(v[key] as string);
  if (Object.keys(v).length !== fields.length || Object.keys(v).some(key => !fields.includes(key)) || v.status !== 'present' || v.version !== 2 || typeof v.reset !== 'boolean' ||
    !text('accountLabel', 200) || !text('preset', 100) || !text('period', 100) || !text('role', 100) ||
    !['Pilot', 'Pilot oder Fluglehrer', 'Fluglehrer', 'Begleiter', 'Pilot oder Begleiter'].includes(v.role as string) ||
    typeof v.journalFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(v.journalFingerprint)) throw new Error('Legacy review unavailable.');
  return { status: 'present', version: 2, accountLabel: v.accountLabel as string, preset: v.preset as string,
    period: v.period as string, role: v.role as string, reset: v.reset, journalFingerprint: v.journalFingerprint };
}
