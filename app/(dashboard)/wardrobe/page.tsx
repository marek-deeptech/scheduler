'use client'

import TeamSection from '@/components/TeamSection'
import { IconHanger } from '@/lib/icons'

export default function WardrobePage() {
  return (
    <TeamSection
      teamName="Wardrobe"
      title="Kostiumy i Garderoba"
      emptyIcon={<IconHanger size={48} className="text-gray-500 mx-auto mb-4" />}
      sectionLabel="Garderoba"
      removeLabel="Usunąć tę osobę z zespołu Kostiumów?"
    />
  )
}
