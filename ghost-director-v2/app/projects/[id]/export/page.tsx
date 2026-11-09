import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { exportState, planCut } from '@/lib/assemble';
import ExportPanel from '@/components/ExportPanel';

export const dynamic = 'force-dynamic';

export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await db.project.findUnique({ where: { id }, select: { id: true } }))) notFound();
  const plan = await planCut(id);
  const state = await exportState(id, plan);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Joins every shot that has an up-to-date clip, in scene order, into one MP4. Shots without one are skipped and listed below.
      </p>
      <ExportPanel projectId={id} plan={plan} state={state} />
    </div>
  );
}
