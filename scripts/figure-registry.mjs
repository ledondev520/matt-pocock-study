export function validateFigureRegistry(registry) {
  const ids = new Set()
  for (const figure of registry.figures) {
    if (typeof figure.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(figure.id) || ids.has(figure.id)) throw new Error(`Invalid figure id: ${figure.id}`)
    ids.add(figure.id)
  }
  return registry
}
