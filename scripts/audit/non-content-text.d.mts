export const allowed: string
export function nonContentText(html: string): { text: string; where: string }[]
export function auditSite(dist?: string): Promise<Record<string, { text: string; where: string }[]>>
