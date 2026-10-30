import { createHash } from 'node:crypto';

export const loginUrl = 'https://vereinsflieger.de/';
export const flightUrl = loginUrl + 'member/profile/flightlog.php';
export const site = 'vereinsflieger.de';
const required = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit'];

export async function waitForLoginReady(page, timeout = 15000) {
  await page.waitForFunction(() => document.querySelector('#submitbtn')?.disabled === false,
    undefined, { timeout });
}

export function authenticatedFlightPage(url, observation, expectedDigest) {
  if (url !== flightUrl || observation.loginControls !== 0 || observation.tables !== 1 ||
      typeof observation.accountLabel !== 'string' || !observation.accountLabel.trim() ||
      observation.accountLabel.length > 200 || !Array.isArray(observation.headers) ||
      !required.every(header => observation.headers.includes(header))) {
    throw new Error('Protected own-flight page not verified');
  }
  const accountDigest = createHash('sha256').update(observation.accountLabel).digest('hex');
  if (expectedDigest && expectedDigest !== accountDigest) throw new Error('Provider account changed');
  return accountDigest;
}

export function readCredentialPacket(text) {
  if (Buffer.byteLength(text, 'utf8') > 8192) throw new Error('Credential packet too large');
  const packet = JSON.parse(text);
  if (typeof packet.username !== 'string' || !packet.username.trim() || packet.username.length > 254 ||
      typeof packet.password !== 'string' || !packet.password || packet.password.length > 256 ||
      Object.keys(packet).some(key => !['username', 'password'].includes(key))) {
    throw new Error('Invalid credential packet');
  }
  return packet;
}
