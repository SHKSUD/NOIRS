'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ProjectTabs({ id }: { id: string }) {
  const path = usePathname();
  const tabs = [
    { href: `/projects/${id}`, label: 'Script' },
    { href: `/projects/${id}/shots`, label: 'Shot list' },
    { href: `/projects/${id}/characters`, label: 'Characters' },
    { href: `/projects/${id}/storyboard`, label: 'Storyboard' },
    { href: `/projects/${id}/render`, label: 'Render' },
  ];
  return (
    // Bottom rule drawn as an inset shadow so the active tab's border can sit on it without overflowing
    // (overflow-x-auto would otherwise show a vertical scrollbar for the 1px overlap).
    <nav className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-line)]" aria-label="Project">
      {tabs.map(t => {
        const active = path === t.href;
        return (
          <Link
            key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-3 py-2 sm:px-4 text-sm font-semibold transition ${active ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-text'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
