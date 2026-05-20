'use client'

import TeamSection from '@/components/TeamSection'
import { IconWrench } from '@/lib/icons'

export default function TechniquePage() {
  return (
    <TeamSection
      teamName="Technique"
      title="Zespół Techniczny"
      emptyIcon={<IconWrench size={48} className="text-gray-300 mx-auto mb-4" />}
      sectionLabel="Technika"
      removeLabel="Usunąć tę osobę z Zespołu Technicznego?"
    />
  )
}
