// DeepSeek chat completions (OpenAI format), non-streaming, thinking mode off.
// Docs: https://api-docs.deepseek.com/guides/thinking_mode/ (toggle `thinking.type`; thinking is
// on by default, and `reasoning_effort` must not be sent with it disabled) and
// https://api-docs.deepseek.com/guides/json_mode/ (`response_format: json_object`, the prompt
// must contain the word "json").

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  thinking: { type: 'disabled' }
  response_format: { type: 'json_object' }
  max_tokens: number
  temperature: number
  stream: false
}
export interface ChatResult { content: string; inputTokens: number; outputTokens: number }

export function chatRequest(model: string, messages: ChatMessage[], maxTokens = 900): ChatRequest {
  return { model, messages, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: maxTokens, temperature: 0.3, stream: false }
}

export class UpstreamError extends Error {
  constructor(readonly kind: 'timeout' | 'http' | 'network' | 'format', detail: string) { super(`${kind}: ${detail}`) }
}

export async function callDeepSeek(opts: { baseUrl: string; apiKey: string; request: ChatRequest; timeoutMs: number; fetch?: typeof fetch }): Promise<ChatResult> {
  const doFetch = opts.fetch ?? fetch
  let response: Response
  try {
    response = await doFetch(`${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify(opts.request),
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
  } catch (error) {
    const name = (error as Error)?.name
    throw new UpstreamError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network', name ?? 'error')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new UpstreamError('http', String(response.status))
  }
  let body: { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
  try {
    // Enforce the bound before decoding/parsing untrusted JSON, independently of max_tokens.
    const reader = response.body?.getReader()
    if (!reader) throw new Error('empty body')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 65_536) { await reader.cancel(); throw new Error('body too large') }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!body || typeof body !== 'object') throw new Error('invalid body')
  } catch { throw new UpstreamError('format', 'invalid JSON body') }
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new UpstreamError('format', 'empty content')
  return { content, inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 }
}

/** Opens after `threshold` consecutive failures; while open no call is made. After `coolDownMs`
 * one trial call is let through: success closes it, failure opens it again. */
export class CircuitBreaker {
  private failures = 0
  private openedAt: number | undefined
  private trial = false
  constructor(private readonly threshold: number, private readonly coolDownMs: number) {}
  allow(now: number): boolean {
    if (this.openedAt === undefined) return true
    if (now - this.openedAt < this.coolDownMs || this.trial) return false
    this.trial = true
    return true
  }
  success() { this.failures = 0; this.openedAt = undefined; this.trial = false }
  failure(now: number) {
    this.failures++
    this.trial = false
    if (this.failures >= this.threshold || this.openedAt !== undefined) this.openedAt = now
  }
  state(now: number): 'closed' | 'open' | 'half-open' {
    if (this.openedAt === undefined) return 'closed'
    return now - this.openedAt < this.coolDownMs ? 'open' : 'half-open'
  }
}
