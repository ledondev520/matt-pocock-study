export function validateFigureRegistry<T extends { figures: { id: string }[] }>(registry: T): T
