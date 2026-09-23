import CamerasApp, { type PublicCamera } from '@/components/CamerasApp';
import { intervalOf, readConfig } from '@/lib/config';
import s from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const cfg = await readConfig();
  const cameras: PublicCamera[] = cfg.cameras
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      streamUrl: c.streamUrl,
      sourceUrl: c.sourceUrl,
      captureEnabled: c.captureEnabled,
      intervalSec: intervalOf(cfg, c),
    }));

  return (
    <div className={s.root}>
      <CamerasApp cameras={cameras} historyBatch={cfg.historyBatch} />
      <footer className={s.footer}>
        As imagens são exibidas através do portal{' '}
        <a href="https://alerta.rolante.ifrs.edu.br/niveis-rios-arroios" target="_blank" rel="noopener">
          alerta.rolante.ifrs.edu.br
        </a>{' '}
        e das páginas de câmera em{' '}
        <a href="https://rolante.solutti.net/rioareia/" target="_blank" rel="noopener">
          rolante.solutti.net
        </a>
        .<br />
        Este site não é responsável pelo conteúdo, disponibilidade ou propriedade das câmeras.
      </footer>
    </div>
  );
}
