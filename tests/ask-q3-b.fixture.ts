import type { MethodologyChunk } from '../server/ask/methodology-adapter'

// Real Q3-b response, unchanged. Source fixtures below retain only marker prefixes and
// overlap-triggering fragments, linked to their originals; empty slots preserve S1–S8.
export const q3bOutput = {
  found: true,
  title: "Matt Pocock 的 TDD 观点",
  points: [
    {
      title: "当前：只写验证真实行为的必要测试",
      text: "他现在的做法是：测试只覆盖真正需要验证的行为，拒绝为凑红绿重构流程而写的测试。",
      quote: { chunk_id: 'S8', start: 0, end: 20 }, sources: ['S8'],
    },
    {
      title: "禁止复述实现的测试",
      text: "他给 /tdd 技能加了一条规则：不要写只是复述实现的测试，因为这种测试提供不了任何信心。",
      quote: { chunk_id: 'S8', start: 0, end: 20 }, sources: ['S8'],
    },
    {
      title: "用 TDD 约束 AI 编码",
      text: "他发布了配合 Claude Code 使用 TDD 的技能，效果从大量与实现耦合的烂测试，变成只保留必要的、验证真实行为的测试。",
      quote: { chunk_id: 'S7', start: 0, end: 20 }, sources: ['S7'],
    },
    {
      title: "AI 时代最值得投入的技能",
      text: "他认为在 AI 时代最值得投入的就是理解 TDD，因为无损的反馈回路才能产出好代码，与是否用 AI 无关。",
      quote: { chunk_id: 'S4', start: 0, end: 20 }, sources: ['S4'],
    },
    {
      title: "早期：偏向集成测试",
      text: "2020 年他认同放弃单元测试、专注集成测试的建议，这是他早期对测试层次的取向。",
      quote: { chunk_id: 'S5', start: 0, end: 20 }, sources: ['S5'],
    },
  ],
}

const chunk = (id: string, text = '', history = true): MethodologyChunk => ({
  chunk_id: `post:${id}`, kind: 'post', title: 'Testing and TDD',
  text: `Testing and TDD · Matt Pocock, 2026-01-01\n${text}`,
  source_url: `https://x.com/mattpocockuk/status/${id}`,
  stance_status: history ? 'history' : 'current',
})

export const q3bChunks = [
  chunk('2105645092476252542', 'Vitest? Is', false),
  chunk('2015007203908874258'),
  chunk('1880261106771587301'),
  chunk('1983274277450453214', 'Strongest recommenda\ninvest in'),
  chunk('1304765848289267712', 'When @AndaristRake t'),
  chunk('1862502667706093936'),
  chunk('2022036754648166527', 'I just published a s\nClaude Code'),
  chunk('2057389140623208493', 'Adding a tweak to th\nadd tests', false),
]
