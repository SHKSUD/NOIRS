import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import ProjectTabs from '@/components/ProjectTabs';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { title: true } });
  if (!project) notFound();
  return (
    <div className="space-y-6 pt-4">
      <h1 className="font-display text-2xl font-semibold tracking-wide text-text sm:text-3xl">{project.title}</h1>
      <ProjectTabs id={id} />
      {children}
    </div>
  );
}
