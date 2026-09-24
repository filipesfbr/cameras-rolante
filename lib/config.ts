import { getText, put } from './r2.ts';
import { state } from './state.ts';

export type Camera = {
  id: string; // slug, vira prefixo de key
  name: string;
  location: string;
  streamUrl: string;
  sourceUrl?: string;
  active: boolean; // aparece na página pública
  captureEnabled: boolean; // "Histórico: ligado" no admin
  intervalSec?: number; // sobrescreve o global
};

export type Config = {
  captureEnabled: boolean; // toggle mestre
  intervalSec: number; // padrão global
  historyBatch: number; // 4–48, lote inicial da faixa
  retentionDays: number;
  cameras: Camera[];
};

export const INTERVALS = [300, 900, 1800, 3600];

const DEFAULTS: Config = {
  captureEnabled: true,
  intervalSec: 900,
  historyBatch: 12,
  retentionDays: 30,
  cameras: [
    {
      id: 'ponte-grassmann',
      name: 'Ponte do Grassmann',
      location: 'Rio Areia',
      streamUrl: 'https://rolante.solutti.net/rioareia/video1_stream.m3u8',
      sourceUrl: 'https://rolante.solutti.net/rioareia/',
      active: true,
      captureEnabled: true,
    },
    {
      id: 'ponte-mata-olho',
      name: 'Ponte Mata Olho',
      location: 'Rio Areia',
      streamUrl: 'https://rolante.solutti.net/pontemataolho/video1_stream.m3u8',
      sourceUrl: 'https://rolante.solutti.net/pontemataolho/',
      active: true,
      captureEnabled: true,
    },
  ],
};

export const intervalOf = (cfg: Config, cam: Camera) => cam.intervalSec ?? cfg.intervalSec;

export async function readConfig(): Promise<Config> {
  if (state.config) return state.config;
  const raw = await getText('config.json');
  if (raw) return (state.config = { ...DEFAULTS, ...JSON.parse(raw) });
  await saveConfig(DEFAULTS); // primeiro boot: grava os padrões
  return DEFAULTS;
}

/** PutObject troca o objeto inteiro de forma atômica; o cache só é atualizado depois do put. */
export async function saveConfig(cfg: Config) {
  await put('config.json', JSON.stringify(cfg, null, 2), 'application/json', 'no-cache');
  state.config = cfg;
}
