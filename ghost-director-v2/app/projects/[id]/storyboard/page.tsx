import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getImage } from '@/lib/providers';
import { frameState, shotWithRefs } from '@/lib/storyboard';
import StoryboardBoard from '@/components/StoryboardBoard';

export const dynamic = 'force-dynamic';

export default async function StoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    select: { scenes: { orderBy: { order: 'asc' }, select: { shots: { orderBy: { order: 'asc' }, ...shotWithRefs } } } },
  });
  if (!project) notFound();

  const shots = project.scenes.flatMap((sc, si) => sc.shots.map((s, i) => ({
    id: s.id, number: `${si + 1}.${i + 1}`, scene: s.scene.heading, description: s.description, framing: s.framing,
    durationSec: s.durationSec, characters: s.characters.map(c => c.character.name), frame: frameState(s),
  })));
  const provider = getImage().name;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Frames are made per shot from the shot list and each character&apos;s locked reference. Editing a shot marks only that frame out of date.
        {' '}Image model: <span className={provider === 'mock' ? 'text-gold' : ''}>{provider === 'mock' ? 'mock (no API key, no cost)' : provider}</span>.
      </p>
      <StoryboardBoard shots={shots} />
    </div>
  );
}
