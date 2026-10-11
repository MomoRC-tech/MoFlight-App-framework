import { LOGIN_URL } from './probe';

export interface SavedLogin { username: string; password: string }
export function validateLogin(input: SavedLogin): SavedLogin {
  if (typeof input.username !== 'string' || typeof input.password !== 'string' || !input.username.trim() || !input.password || input.username.length > 254 || input.password.length > 256) throw new Error('Enter a username and password within the supported limits.');
  const login = { username: input.username.trim(), password: input.password };
  if (encodeURIComponent(JSON.stringify(login)).replace(/%[0-9A-F]{2}/g, 'x').length > 1900) throw new Error('Login is too large for device storage.');
  return login;
}
export function loginPage(url: string): boolean {
  try { return new URL(url).href === LOGIN_URL; } catch { return false; }
}
// Write only explicitly supplied app credentials into the observed original form.
// Never read its current credential values, cookies, dynamic salts or hidden fields.
const source = String.raw`function(login) {
  if (window.top !== window || location.href !== 'https://vereinsflieger.de/') return 'wrong-page';
  const users = document.querySelectorAll('input[name="user"]');
  const passwords = document.querySelectorAll('input[name="pwinput"]#pwinput');
  const buttons = document.querySelectorAll('button#submitbtn');
  if (users.length !== 1) return 'username-control';
  if (passwords.length !== 1) return 'password-control';
  if (buttons.length !== 1) return 'submit-control';
  const user = users[0], password = passwords[0], button = buttons[0], form = user.form;
  if (!form || password.form !== form || button.form !== form || form.method.toLowerCase() !== 'post') return 'form-binding';
  const action = new URL(form.getAttribute('action') || location.href, location.href);
  if (action.href !== location.href || !['password','text'].includes(password.type) || user.type !== 'text') return 'form-target';
  user.value = login.username; password.value = login.password;
  for (const element of [user,password]) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
  button.click();
  return 'submitted';
}`;
export function savedLoginScript(input: SavedLogin, nonce?: string): string {
  return `(()=>{const result=(${source})(${JSON.stringify(validateLogin(input))});window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-login-result-v1',nonce:${JSON.stringify(nonce ?? '')},url:location.href,result}));})();true;`;
}
