import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import Script from 'next/script';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter', display: 'swap' });

const title = 'Câmeras dos Rios - Rolante';
const description = 'Câmeras de monitoramento dos rios de Rolante/RS, ao vivo e com histórico.';

export const metadata: Metadata = {
  metadataBase: new URL('https://cameras-rolante.onrender.com'), // og:image precisa de URL absoluta
  title,
  description,
  openGraph: { title, description },
};

// padrão escuro; o botão do topo grava `theme=light` no cookie (CamerasApp)
const theme = async () => ((await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark');

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: (await theme()) === 'light' ? '#faf8f4' : '#26221d' };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable} data-theme={await theme()}>
      <body>
        {children}
        <Script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "9e0a8e76e4ff44bea15a156e09a8a39f"}' />
      </body>
    </html>
  );
}
