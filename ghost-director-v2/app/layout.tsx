import type { Metadata } from 'next';
import Link from 'next/link';
import { Cinzel, Figtree } from 'next/font/google';
import './globals.css';

const cinzel = Cinzel({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-cinzel' });
const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree' });

export const metadata: Metadata = {
  title: 'Ghost Director',
  description: 'Turn a script into a controllable short film. Fix one shot without redoing the rest.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${figtree.variable}`}>
      <body className="font-sans antialiased">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
          <Link href="/" className="title-gold text-lg font-semibold">Ghost Director</Link>
          <nav className="text-sm text-muted">
            <Link href="/" className="hover:text-gold">Projects</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-20">{children}</main>
      </body>
    </html>
  );
}
