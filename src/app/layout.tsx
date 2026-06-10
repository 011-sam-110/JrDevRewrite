import type { Metadata } from 'next';
import { Chakra_Petch, JetBrains_Mono, Russo_One } from 'next/font/google';
import './globals.css';

/* next/font self-hosts at build time (no runtime Google request) and exposes
   each family as a CSS variable consumed by the @theme tokens in globals.css. */
const chakra = Chakra_Petch({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-chakra',
  display: 'swap',
});
const russo = Russo_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-russo',
  display: 'swap',
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Junior Dev',
  description:
    'Competitive coding for Sussex CS students — prize pools, live code battles, and a profile that proves you can ship.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${chakra.variable} ${russo.variable} ${jetbrains.variable}`}>
      <body className="bg-bg text-fg font-sans antialiased">{children}</body>
    </html>
  );
}
