import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
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

export const viewport: Viewport = { themeColor: '#faf8f4' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
