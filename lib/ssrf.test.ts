import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPublicUrl, isPrivateIp, type Resolve } from './ssrf.ts';

const publicHost: Resolve = async () => [{ address: '1.2.3.4' }];
const neverCalled: Resolve = async () => {
  throw new Error('não deveria consultar o DNS');
};

test('ssrf: bloqueia loopback, rede privada, link-local e v4-mapeado', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1'])
    assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
});

test('assertPublicUrl aceita https com host público ou IP público', async () => {
  await assertPublicUrl('https://cam.exemplo.com/video.m3u8?x=1', publicHost);
  await assertPublicUrl('https://8.8.8.8/video.m3u8', neverCalled); // IP literal não consulta DNS
});

test('assertPublicUrl rejeita http, URL inválida e host que não resolve', async () => {
  await assert.rejects(assertPublicUrl('http://cam.exemplo.com/x', publicHost), /https/);
  await assert.rejects(assertPublicUrl('não é url', publicHost), /URL inválida/);
  await assert.rejects(
    assertPublicUrl('https://sumido.exemplo.com/x', async () => {
      throw new Error('ENOTFOUND');
    }),
    /host não encontrado/,
  );
});

test('assertPublicUrl rejeita privado, inclusive se só um dos endereços for privado', async () => {
  await assert.rejects(assertPublicUrl('https://cam.exemplo.com/x', async () => [{ address: '127.0.0.1' }]), /endereço privado/);
  await assert.rejects(
    assertPublicUrl('https://cam.exemplo.com/x', async () => [{ address: '1.2.3.4' }, { address: '10.0.0.7' }]),
    /endereço privado/,
  );
  await assert.rejects(assertPublicUrl('https://vazio.exemplo.com/x', async () => []), /endereço privado/);
  await assert.rejects(assertPublicUrl('https://10.0.0.1/x', neverCalled), /endereço privado/);
  await assert.rejects(assertPublicUrl('https://[::1]/x', neverCalled), /endereço privado/);
});
