import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [ip, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
] as const) blocked.addSubnet(ip, bits, 'ipv4');
for (const [ip, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const)
  blocked.addSubnet(ip, bits, 'ipv6');

export const isPrivateIp = (ip: string) => {
  const v = isIP(ip);
  return v === 0 || blocked.check(ip, v === 6 ? 'ipv6' : 'ipv4');
};

/** Exige https e host que resolva só pra endereço público. O ffmpeg vai buscar essa URL de dentro da VPS. */
export async function assertPublicUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('URL inválida');
  }
  if (u.protocol !== 'https:') throw new Error('só URLs https são aceitas');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs: string[];
  try {
    addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new Error('host não encontrado');
  }
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error('endereço privado ou interno não é permitido');
}
