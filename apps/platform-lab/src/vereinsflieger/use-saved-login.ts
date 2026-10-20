import { useEffect, useRef, useState } from 'react';
import { LOGIN_URL } from './probe';
import { scopedBridge } from './context';
import { loginPage, savedLoginScript } from './login';
import { readSavedLogin, writeSavedLogin, forgetSavedLogin } from './login-storage';

export interface SavedLoginPorts {
  product: boolean;
  canStart(action: 'save' | 'forget' | 'use'): boolean;
  isCurrent(epoch: number): boolean;
  currentUrl(): string;
  beforeUse(): void;
  navigate(url: string): void;
  inject(script: string): void;
  setStatus(message: string): void;
  setVisible(visible: boolean): void;
  uuid(): string;
}

/** Owns only saved-login state; the parent admits operations and owns the browser. */
export function useSavedLogin(ports: SavedLoginPorts) {
  const loginAttempt = useRef<'waiting' | 'reading' | 'submitted' | null>(null);
  const loginNonce = useRef('');
  const loginStorageBusy = useRef(false);
  const [loginNotice, setLoginNotice] = useState<'none' | 'response' | 'unavailable' | 'failed' | 'cancelled'>('none');
  const [credentialNotice, setCredentialNotice] = useState<'none' | 'forgotten' | 'error'>('none');
  const loginTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasLogin, setHasLogin] = useState(false), [editingLogin, setEditingLogin] = useState(false), [loginBusy, setLoginBusy] = useState(false);
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');

  useEffect(() => {
    let active = true;
    if (!ports.product) void readSavedLogin().then(login => { if (active) setHasLogin(!!login); })
      .catch(() => { if (active) ports.setStatus('Protected login storage could not be opened. Existing captures remain available.'); });
    return () => { active = false; loginAttempt.current = null; clearTimer(); };
  }, []);

  function clearTimer() {
    if (loginTimer.current) clearTimeout(loginTimer.current);
    loginTimer.current = null;
  }
  function endLogin(message: string, verdict: 'response' | 'unavailable' | 'failed' | 'cancelled' = 'failed') {
    setLoginNotice(verdict); loginAttempt.current = null; clearTimer(); setLoginBusy(false); ports.setStatus(message);
  }
  async function saveLogin() {
    if (!ports.canStart('save') || loginStorageBusy.current || loginBusy || loginAttempt.current) return;
    loginStorageBusy.current = true; setCredentialNotice('none'); setLoginBusy(true);
    try {
      await writeSavedLogin({ username, password });
      setUsername(''); setPassword(''); setEditingLogin(false); setHasLogin(true);
      ports.setStatus('Login saved only on this device. Use saved login when the provider asks you to sign in.');
    } catch { ports.setStatus('Login could not be saved. Check the fields and try again.'); }
    finally { loginStorageBusy.current = false; setLoginBusy(false); }
  }
  async function forgetLogin() {
    if (!ports.canStart('forget') || loginStorageBusy.current || loginBusy || loginAttempt.current) return;
    loginStorageBusy.current = true; setCredentialNotice('none'); setLoginBusy(true);
    try {
      await forgetSavedLogin(); setCredentialNotice('forgotten'); setHasLogin(false); setUsername(''); setPassword('');
      ports.setStatus('Saved username and password forgotten. Existing browser session and captured flights are preserved.');
    } catch { setCredentialNotice('error'); ports.setStatus('Saved login could not be removed. Try again.'); }
    finally { loginStorageBusy.current = false; setLoginBusy(false); }
  }
  function useLogin() {
    if (!ports.canStart('use') || loginStorageBusy.current || loginBusy || loginAttempt.current) return;
    ports.beforeUse(); setLoginNotice('none');
    loginAttempt.current = 'waiting'; setLoginBusy(true); ports.setVisible(true); setEditingLogin(false);
    loginNonce.current = ports.uuid();
    ports.setStatus('Opening the original provider page for one saved-login attempt.');
    loginTimer.current = setTimeout(() => endLogin('Saved sign-in did not finish. Provider interaction may be required; no retry loop was started.'), 30_000);
    ports.navigate(LOGIN_URL);
  }
  async function readLoginPage(page: string, pageEpoch: number) {
    if (!loginPage(page)) { endLogin('Provider session page opened. Verify the account and retrieve flights.', 'response'); return; }
    // Duplicate native load-end events must not start a second secret read.
    loginAttempt.current = 'reading';
    try {
      const login = await readSavedLogin();
      if (!ports.isCurrent(pageEpoch)) return;
      if (!login || !loginPage(ports.currentUrl()) || loginAttempt.current !== 'reading') {
        endLogin('Saved login unavailable or page changed. No credentials submitted.', 'unavailable'); return;
      }
      loginAttempt.current = 'submitted'; ports.inject(savedLoginScript(login, loginNonce.current));
      ports.setStatus('Saved login attempted once on the original provider page. Complete verification there if requested.');
    } catch { if (ports.isCurrent(pageEpoch)) endLogin('Saved login could not be used. Existing captures preserved.'); }
  }
  function pageLoaded(page: string, pageEpoch: number): Promise<void> | null {
    if (loginAttempt.current === 'waiting') return readLoginPage(page, pageEpoch);
    if (loginAttempt.current === 'submitted') {
      endLogin('Provider response opened after the saved-login attempt. Verify the account, then retrieve flights; any provider verification remains on this page.', 'response');
      return Promise.resolve();
    }
    return null;
  }
  function receiveMessage(event: { url: string; data: string }): boolean {
    if (loginAttempt.current !== 'submitted' || !loginPage(ports.currentUrl()) ||
        !scopedBridge(event.url, ports.currentUrl(), LOGIN_URL) || event.data.length >= 2000) return false;
    try {
      const message = JSON.parse(event.data);
      if (message.kind !== 'vf-login-result-v1' || message.nonce !== loginNonce.current || message.url !== LOGIN_URL) return false;
      if (message.result === 'submitted') {
        ports.setStatus('Original provider submit control invoked once. Waiting for its response; sign-in is not yet verified.'); return true;
      }
      if (message.result === 'provider-script-error') {
        endLogin('Saved sign-in stopped because the original provider form raised an error. Submission was not confirmed. Complete sign-in on the original page.'); return true;
      }
      if (['wrong-page', 'username-control', 'password-control', 'submit-control', 'form-binding', 'form-target'].includes(message.result)) {
        endLogin(`Saved sign-in stopped: unsupported original ${message.result}. No credentials submitted. Use the original provider page.`); return true;
      }
    } catch { /* Ignore unrelated bridge messages. */ }
    return false;
  }
  return { loginAttempt, loginStorageBusy, clearTimer, endLogin, setLoginNotice, pageLoaded, receiveMessage,
    loginNotice, credentialNotice, hasLogin, editingLogin, setEditingLogin, loginBusy,
    username, setUsername, password, setPassword, saveLogin, forgetLogin, useLogin };
}
