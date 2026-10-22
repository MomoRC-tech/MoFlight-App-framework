import { diagnosticJournal } from '../diagnostics';
import { providerDiagnosticEvents } from '../diagnostic-vocabulary';
import { providerUrl } from './probe';
import { PROFILE_URL, scopedBridge } from './context';

export type ProviderDiagnosticEvent = typeof providerDiagnosticEvents[number];
export function recordProviderEvent(event: ProviderDiagnosticEvent) { diagnosticJournal.record('provider', event); }

/** Only fixed categories enter the report, never the URL, query, IDs or title. */
export function recordProviderDocument(stage: 'command' | 'start' | 'end', url: string) {
  const category = !providerUrl(url) ? 'other' : url === PROFILE_URL ? 'profile' :
    new URL(url).pathname === '/' ? 'login' : new URL(url).pathname.startsWith('/member/') ? 'member' : 'other';
  recordProviderEvent(`provider-${stage}-${category}`);
}

const loginEvents = ['provider-login-ready', 'provider-login-input', 'provider-login-change', 'provider-login-click', 'provider-login-submit', 'provider-login-exit'] as const;
export function readLoginDiagnostic(source: string, current: string, data: string, document: number): ProviderDiagnosticEvent | null {
  if (!providerUrl(current) || new URL(current).pathname !== '/' || !scopedBridge(source, current, current) || data.length > 512) return null;
  try {
    const message = JSON.parse(data);
    return message.kind === 'vf-login-diagnostic-v1' && message.document === document && loginEvents.includes(message.event) ? message.event : null;
  } catch { return null; }
}

/** Passive event observation: no field values, DOM text, cookies or form data. */
export function loginDiagnosticScript(document: number) {
  return `(()=>{try{(${LOGIN_DIAGNOSTIC_SOURCE})(${document});}catch{}})();true;`;
}
export const LOGIN_DIAGNOSTIC_SOURCE = String.raw`function(documentToken) {
  if (window.top !== window || location.protocol !== 'https:' ||
      !['vereinsflieger.de','www.vereinsflieger.de'].includes(location.hostname) || location.pathname !== '/') return;
  const form = document.querySelector('form#signin'), user = document.querySelector('input[name="user"]'), password = document.querySelector('input#pwinput[name="pwinput"]');
  if (!form || user?.form !== form || password?.form !== form) return;
  if (window.__moflightLoginDiagnostic) { window.__moflightLoginDiagnostic.document = documentToken; return; }
  const state = { document:documentToken, remaining:32 }; window.__moflightLoginDiagnostic = state;
  const send = event => {
    if (state.remaining-- <= 0) return;
    window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-login-diagnostic-v1',document:state.document,event}));
  };
  for (const event of ['input','change']) form.addEventListener(event, e => {
    if (e.target === user || e.target === password) send('provider-login-'+event);
  }, true);
  form.addEventListener('click', e => { if (e.target?.closest?.('button#submitbtn')?.form === form) send('provider-login-click'); }, true);
  form.addEventListener('submit', () => send('provider-login-submit'), true);
  window.addEventListener('pagehide', () => send('provider-login-exit'));
  send('provider-login-ready');
}`;
