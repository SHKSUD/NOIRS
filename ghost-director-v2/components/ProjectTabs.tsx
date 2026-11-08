'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ProjectTabs({ id }: { id: string }) {
  const path = usePathname();
  const tabs = [
    { href: `/projects/${id}`, label: 'Script' },
    { href: `/projects/${id}/shots`, label: 'Shot list' },
  ];
  return (
    <nav className="flex gap-1 border-b border-line" aria-label="Project">
      {tabs.map(t => {
        const active = path === t.href;
        return (
          <Link
            key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${active ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-text'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
