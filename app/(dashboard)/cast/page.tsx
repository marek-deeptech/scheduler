'use client'

import TeamSection from '@/components/TeamSection'
import { IconTheatre } from '@/lib/icons'

export default function CastPage() {
  return (
    <TeamSection
      teamName="Cast"
      title="Obsada"
      emptyIcon={<IconTheatre size={48} className="text-gray-300 mx-auto mb-4" />}
      sectionLabel="Obsada"
      removeLabel="Usunąć tę osobę z zespołu Obsady?"
    />
  )
}
