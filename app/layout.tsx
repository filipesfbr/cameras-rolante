import type { Metadata } from 'next';
import { Space_Grotesk, Space_Mono } from 'next/font/google';
import './globals.css';

const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-space-grotesk', display: 'swap' });
const mono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-space-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Câmeras dos Rios - Rolante',
  description: 'Câmeras de monitoramento dos rios de Rolante/RS, ao vivo e com histórico.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${grotesk.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
