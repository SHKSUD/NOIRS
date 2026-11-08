import Link from 'next/link';
import { db } from '@/lib/db';
import { getLLM } from '@/lib/providers';
import NewProjectForm from '@/components/NewProjectForm';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const projects = await db.project.findMany({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, updatedAt: true, _count: { select: { scenes: true } }, scenes: { select: { _count: { select: { shots: true } } } } },
  });

  return (
    <div className="space-y-10">
      <section className="pt-6">
        <h1 className="title-gold text-3xl font-semibold sm:text-4xl">Script to shot list</h1>
        <p className="mt-2 max-w-xl text-muted">
          Paste a script. It is split into scenes and shots you can edit one by one, so you can fix one shot without redoing the rest.
        </p>
      </section>

      <NewProjectForm provider={getLLM().name} />

      <section>
        <h2 className="label">Your projects</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted">No projects yet. Break down your first script above.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map(p => {
              const shots = p.scenes.reduce((n, s) => n + s._count.shots, 0);
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}/shots`} className="card block p-4 transition hover:border-gold/50">
                    <div className="font-semibold">{p.title}</div>
                    <div className="mt-1 text-xs text-muted">
                      {p._count.scenes} scenes · {shots} shots · updated {p.updatedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
