import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import ScriptEditor from '@/components/ScriptEditor';

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.project.findUnique({ where: { id }, select: { title: true, script: true } });
  if (!p) notFound();
  return <ScriptEditor id={id} title={p.title} script={p.script} />;
}
