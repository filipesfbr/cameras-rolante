// Só Web Crypto: roda no proxy (Edge ou Node) e em Server Actions, sem dependência.
const enc = new TextEncoder();
const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

const b64 = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const SESSION_MS = 7 * 86_400_000;

/** "<expira>.<hmac>", assinado com a própria senha do admin: trocar a senha invalida as sessões. */
export async function makeToken(secret: string, now = Date.now()) {
  const exp = String(now + SESSION_MS);
  return `${exp}.${b64(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(exp)))}`;
}

export async function checkToken(secret: string, token: string | undefined, now = Date.now()) {
  if (!secret || !token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !(Number(exp) > now)) return false;
  try {
    return await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64(sig), enc.encode(exp));
  } catch {
    return false;
  }
}

/** Comparação em tempo constante (o verify do HMAC compara sem curto-circuito). */
export async function samePassword(input: string, secret: string) {
  if (!input || !secret) return false;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(input), enc.encode('login'));
  return crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode('login'));
}
