import { validateAiRequest, type AiRequest } from '../../../packages/ai-contracts/src/index.ts';

export interface ConfiguredAiAccount { provider: 'vereinsflieger'; accountRef: string; enabled: boolean; billingTag: string }
export interface AccountLookup { find(provider: 'vereinsflieger', accountRef: string): Promise<ConfiguredAiAccount | null> }
export class AiAdmissionDenied extends Error {
  constructor() { super('AI account unavailable'); }
}
export function opaqueBillingTag(value: unknown): string {
  if (typeof value !== 'string' || !/^mf_[A-Za-z0-9_-]{43}$/.test(value)) throw new AiAdmissionDenied();
  return value;
}
/** ID assertion/allowlist only. A forged known enabled ID remains indistinguishable. */
export async function admitConfiguredAccount(value: unknown, lookup: AccountLookup): Promise<{ request: AiRequest; billingTag: string }> {
  const request = validateAiRequest(value);
  const account = await lookup.find(request.provider, request.accountRef);
  if (!account || account.provider !== request.provider || account.accountRef !== request.accountRef || account.enabled !== true) throw new AiAdmissionDenied();
  return { request, billingTag: opaqueBillingTag(account.billingTag) };
}
