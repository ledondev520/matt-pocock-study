// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AskPanel } from '../src/AskPanel'
import type { AskResult } from '../src/lib/ask'

let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
async function submit() {
  await act(async () => {
    const input = host.querySelector('textarea')!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'review')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}

for (const lang of ['zh', 'en'] as const) {
  for (const result of [{ mode: 'unavailable' }, { mode: 'limited', reason: 'limit' }, { mode: 'search', reason: 'disabled', message: 'Must never be shown', citations: [] }] satisfies AskResult[]) {
    it(`${lang} passes ${result.mode} back to local search without an error explanation`, async () => {
      const fallback = vi.fn()
      await act(async () => root.render(<AskPanel lang={lang} ask={async () => result} onFallback={fallback} />))
      expect(document.activeElement).toBe(host.querySelector('textarea'))
      await submit()
      expect(fallback).toHaveBeenCalledExactlyOnceWith('review')
      expect(host.querySelector('.ask-result')!.textContent).toBe('')
      expect(host.querySelector('button')!.disabled).toBe(false)
    })
  }
}
it('keeps a quoted point and its original-post link as plain text', async () => {
  const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
  await act(async () => root.render(<AskPanel lang="en" ask={async () => ({ mode: 'answer', title: 'Review', points: [{ title: 'First', text: '<b>plain text</b>', quote: 'easy to roll back', quoteUrl: url, cites: [1] }], citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false })} />))
  await submit()
  expect(host.querySelector('blockquote')!.textContent).toContain('easy to roll back')
  expect(host.querySelector('blockquote a')!.getAttribute('href')).toBe(url)
  expect(host.querySelector('.ask-result')!.textContent).toContain('<b>plain text</b>')
  expect(host.querySelector('.ask-result b')).toBeNull()
})
it('quietly falls back if the request throws', async () => {
  const fallback = vi.fn()
  await act(async () => root.render(<AskPanel lang="en" ask={async () => { throw new Error('offline') }} onFallback={fallback} />))
  await submit()
  expect(fallback).toHaveBeenCalledExactlyOnceWith('review')
  expect(host.querySelector('.ask-result')!.textContent).toBe('')
})

it('renders an extracted quote without an explanation or extra copy', async () => {
  const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
  await act(async () => root.render(<AskPanel lang="zh" ask={async () => ({ mode: 'answer', title: '', points: [{ title: '', text: '', quote: '先拆分。\n再验证。', quoteUrl: url, cites: [1] }], citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false })} />))
  await submit()
  expect(host.querySelector('h3')).toBeNull()
  expect(host.querySelector('.ask-explanation')!.textContent).toBe('')
  expect(host.querySelector('blockquote p')!.textContent).toBe('先拆分。\n再验证。')
  expect(host.querySelector('blockquote cite a')!.getAttribute('href')).toBe(url)
  expect(host.querySelector('blockquote')!.hasAttribute('lang')).toBe(false)
  expect(host.querySelector('.ask-result')!.textContent).not.toMatch(/verified|extracted|来源校验|服务端/)
})
