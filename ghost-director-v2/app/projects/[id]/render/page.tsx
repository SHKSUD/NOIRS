import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getVideo } from '@/lib/providers';
import { fileUrl } from '@/lib/storage';
import { shotWithRefs } from '@/lib/storyboard';
import { renderState } from '@/lib/render';
import RenderBoard from '@/components/RenderBoard';

export const dynamic = 'force-dynamic';

export default async function RenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    select: { scenes: { orderBy: { order: 'asc' }, select: { shots: { orderBy: { order: 'asc' }, ...shotWithRefs } } } },
  });
  if (!project) notFound();

  const shots = project.scenes.flatMap((sc, si) => sc.shots.map((s, i) => ({
    id: s.id, number: `${si + 1}.${i + 1}`, scene: s.scene.heading, description: s.description, camera: s.camera,
    durationSec: s.durationSec, frameUrl: fileUrl(s.storyboardImage), render: renderState(s),
  })));
  const provider = getVideo().name;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Each shot renders on its own from its storyboard frame. Re-rendering one shot never touches the others.
        {' '}Video model: <span className={provider === 'mock' ? 'text-gold' : ''}>{provider === 'mock' ? 'mock (animated preview, no cost)' : provider}</span>.
      </p>
      <RenderBoard projectId={id} shots={shots} provider={provider} />
    </div>
  );
}
