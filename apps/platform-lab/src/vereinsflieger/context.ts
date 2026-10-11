import { providerUrl } from './probe';
export const PROFILE_URL = 'https://vereinsflieger.de/member/profile/viewprofile';
export interface ObservedContext { accountNumber: string; clubLabel: string; clubIdentity: 'display-label-only'; verification: 'observed-profile-number'; }
export function validateContext(value: unknown): ObservedContext {
  if (!value || typeof value !== 'object') throw new Error('Missing observed provider context'); const c = value as ObservedContext;
  if (typeof c.accountNumber !== 'string' || !/^\d{1,20}$/.test(c.accountNumber) || typeof c.clubLabel !== 'string' || !c.clubLabel.trim() || c.clubLabel.length > 200 || c.clubIdentity !== 'display-label-only' || c.verification !== 'observed-profile-number') throw new Error('Unsupported provider context');
  return { accountNumber: c.accountNumber, clubLabel: c.clubLabel, clubIdentity: c.clubIdentity, verification: c.verification };
}
export function sameContext(a: ObservedContext, b: ObservedContext) { return a.accountNumber === b.accountNumber && a.clubLabel === b.clubLabel; }
// Observed in the authenticated desktop profile on 2026-10-11. Read just the
// numeric user reference and top navigation club label; exclude other profile
// fields, forms, documents, contact information and financial information.
export const CONTEXT_READER_SOURCE = String.raw`() => {
  if (window.top !== window || location.protocol !== 'https:' || !['vereinsflieger.de','www.vereinsflieger.de'].includes(location.hostname) || location.pathname !== '/member/profile/viewprofile') return { error:'session-required' };
  if (document.querySelectorAll('input[name="user"]').length && document.querySelectorAll('input[name="pwinput"]#pwinput').length) return { error:'session-required' };
  const rows = Array.from(document.querySelectorAll('table.tablelist.alternative tr')).filter(r => r.cells[0]?.textContent.trim() === 'Benutzernummer');
  const clubs = Array.from(document.querySelectorAll('#topnavi a[href]')).filter(a => new URL(a.getAttribute('href'), location.href).pathname === '/member/community/main');
  if (rows.length !== 1 || rows[0].cells.length !== 2) return { error:'profile-number-unavailable' };
  if (clubs.length !== 1 || !clubs[0].textContent.trim()) return { error:'profile-club-unavailable' };
  return { accountNumber:rows[0].cells[1].textContent.trim(), clubLabel:clubs[0].textContent.trim(), clubIdentity:'display-label-only', verification:'observed-profile-number' };
}`;
// Fixed messages only: never display a provider response or private profile value.
export function contextFailure(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  switch ((value as {error?:unknown}).error) {
    case 'session-required': return 'Provider sign-in is required. Close capture and use the saved-login control, then retry.';
    case 'profile-number-unavailable': return 'The provider profile number could not be read from the supported layout. Saved pages are preserved.';
    case 'profile-club-unavailable': return 'The provider club label could not be read from the supported layout. Saved pages are preserved.';
    default: return null;
  }
}
export function contextScript(nonce: string) { return `window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-context-v1',nonce:${JSON.stringify(nonce)},url:location.href,context:(${CONTEXT_READER_SOURCE})()}));true;`; }
export function scopedBridge(source: string, document: string, expected: string) {
  if (!providerUrl(source) || !providerUrl(document) || !providerUrl(expected)) return false;
  const s = new URL(source), d = new URL(document), e = new URL(expected);
  return s.origin === d.origin && d.origin === e.origin && d.pathname === e.pathname && d.search === e.search && (s.pathname === '/' && !s.search && !s.hash || s.pathname === d.pathname && s.search === d.search);
}
