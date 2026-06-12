/** Helpers for sorting people alphabetically by surname (last word of the name). */

export function lastName(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name
}

/** Sorts a plain list of full names by surname, Polish collation. */
export function sortNamesByLastName(names: string[]): string[] {
  return [...names].sort((a, b) =>
    lastName(a).localeCompare(lastName(b), 'pl') || a.localeCompare(b, 'pl')
  )
}

/** Sorts a list of objects with a `name` field by surname, Polish collation. */
export function sortByLastName<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    lastName(a.name).localeCompare(lastName(b.name), 'pl') ||
    a.name.localeCompare(b.name, 'pl')
  )
}
