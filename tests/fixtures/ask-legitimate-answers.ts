// Synthetic originals and independent explanations; shared terminology is intentional.
export const legitimate = [
  {
    name: 'repeated TypeScript in an English paraphrase',
    sources: ['A patient gardener labels every seed tray; TypeScript appears on the workshop sign.'],
    title: 'Work with TypeScript deliberately',
    texts: [
      'Use TypeScript to express the relationship the caller needs. TypeScript helps preserve that relationship as values move between operations.',
      'Before introducing TypeScript generics, sketch a concrete input and its expected result. Let that example guide the signature you choose in TypeScript.',
    ],
  },
  {
    name: 'monorepo commands in a Chinese paraphrase',
    sources: ['Copper lanterns mark the northern trail; monorepo is printed beside turbo-ignore.', 'Violet ribbons distinguish the sample crates; project references appear on the shipping label.'],
    title: '用 monorepo 约束影响范围',
    texts: [
      '在 monorepo 中先检查哪些包受到修改影响，再让 turbo-ignore 缩小需要执行的工作。monorepo 放在一起以后，检查仍应围绕明确的依赖关系展开。',
      '需要先比较 project references 与缓存各自解决的问题，再按团队的维护能力选择。project references 可以作为依赖建模的一种工具，不能代替包的职责设计。',
    ],
  },
  {
    name: 'pull request inflections across several fields',
    sources: ['Amber notebooks track the expedition; one pull request closes the inventory ledger.'],
    title: 'Shape each pull request around a decision',
    texts: [
      'Give the pull request a bounded purpose. Keep a pull request focused enough that a reviewer can explain its intended effect without guessing.',
      'Provide the checks that establish the change works. Several pull requests may be easier to assess when each pull request answers one review question.',
    ],
  },
  {
    name: 'tool names repeated alongside independent reasoning',
    sources: ['Silver markers indicate the eastern route; Claude Code features on the itinerary.', 'Crimson folders record each sample; Vitest and TypeScript appear on the laboratory door.'],
    title: 'Build a useful feedback loop',
    texts: [
      '让 Claude Code 先描述预期行为，再用 Vitest 检查可观察的结果。Claude Code 需要根据失败信息修正方案，避免为了证明执行过步骤而制造没有价值的断言。',
      '用 TypeScript 表达接口约束，让 Vitest 检查运行时行为。两种反馈解决不同的问题，应该结合具体风险来决定需要哪些检查。',
    ],
  },
  {
    name: 'Latin terms adjoining Chinese prose without spaces',
    sources: ['A patient gardener labels every seed tray; TypeScript appears on the workshop sign.', 'Copper lanterns mark the northern trail; monorepo is printed beside turbo-ignore.'],
    title: '让TypeScript约束monorepo里的接口',
    texts: [
      '在TypeScript中先用一个具体调用说明预期结果，再让TypeScript表达输入和返回值之间的联系。TypeScript提供的约束需要服务于调用者，避免让复杂声明掩盖真实需求。',
      '调整monorepo之前先确认包的职责与依赖方向。monorepo让修改集中在一个仓库，但边界仍然需要明确的入口和持续检查，不能只依赖目录组织。',
    ],
  },
]
