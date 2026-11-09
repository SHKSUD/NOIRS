import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import CharacterCard from '@/components/CharacterCard';
import AddCharacterForm from '@/components/AddCharacterForm';

export const dynamic = 'force-dynamic';

export default async function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    select: { characters: { orderBy: { name: 'asc' }, include: { _count: { select: { shots: true } } } } },
  });
  if (!project) notFound();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Lock each character&apos;s look with a reference image (PNG, JPEG or WebP, up to 2 MB). Storyboard frames reuse it in every shot.
      </p>
      {project.characters.length === 0 && <p className="text-sm text-muted">No characters yet. Add one below.</p>}
      {project.characters.map(c => (
        <CharacterCard key={c.id} id={c.id} name={c.name} styleNote={c.styleNote}
          referenceUrl={fileUrl(c.referenceImage)} shotCount={c._count.shots} />
      ))}
      <AddCharacterForm projectId={id} />
    </div>
  );
}
