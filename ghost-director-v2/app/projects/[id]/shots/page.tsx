import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import ShotCard, { ShotDatalists } from '@/components/ShotCard';
import { frameState, shotWithRefs } from '@/lib/storyboard';
import { renderState } from '@/lib/render';
import SceneHeader from '@/components/SceneHeader';

export const dynamic = 'force-dynamic';

export default async function ShotListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    select: {
      characters: { orderBy: { name: 'asc' }, select: { id: true, name: true } },
      scenes: {
        orderBy: { order: 'asc' },
        select: {
          id: true, heading: true, summary: true,
          shots: { orderBy: { order: 'asc' }, ...shotWithRefs },
        },
      },
    },
  });
  if (!project) notFound();

  const shotCount = project.scenes.reduce((n, s) => n + s.shots.length, 0);

  return (
    <div className="space-y-8">
      <ShotDatalists />
      <p className="text-sm text-muted">
        {project.scenes.length} scenes · {shotCount} shots · {project.characters.length} characters.
        Edits save automatically, one shot at a time.
      </p>

      {project.scenes.map((scene, si) => (
        <section key={scene.id} className="space-y-3" aria-label={`Scene ${si + 1}`}>
          <SceneHeader id={scene.id} number={si + 1} heading={scene.heading} summary={scene.summary}
            shots={scene.shots.length} seconds={Math.round(scene.shots.reduce((t, s) => t + s.durationSec, 0))} />
          <div className="space-y-3">
            {scene.shots.map((shot, i) => (
              <ShotCard
                key={shot.id}
                characters={project.characters}
                frame={frameState(shot)}
                render={renderState(shot)}
                shot={{
                  id: shot.id, number: `${si + 1}.${i + 1}`, description: shot.description, camera: shot.camera,
                  framing: shot.framing, mood: shot.mood, durationSec: shot.durationSec, dialogue: shot.dialogue,
                  characterIds: shot.characters.map(c => c.characterId),
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
