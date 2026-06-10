import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Junior Dev',
  description:
    'Competitive coding for Sussex CS students — prize pools, live code battles, and a profile that proves you can ship.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
