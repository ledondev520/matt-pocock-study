export function parseListenOptions(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 8787)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535')
  return { hostname: env.HOST ?? '127.0.0.1', port }
}
