## 改了什么 / 为什么 · What and why

<!-- 一两句话 / one or two sentences -->

## 门型 · Door type

- [ ] 双向门 two-way:回退提交即可恢复 / a revert fully undoes it
- [ ] 单向门 one-way:删数据、对外发布、不可逆改写等 / data deletion, public release, irreversible changes

理由 / reason:

<!-- 单向门即使 CI 全绿,合并前也要先报负责人批准 / one-way doors need owner approval before merge even when CI is green -->

## 影响范围 · Blast radius

<!-- 模块、页面、数据;大/中/小 -->

## 回滚方式 · Rollback

<!-- 例如 revert 本 PR 的 merge commit -->

## 测试 · Tests

<!-- 实际跑过的命令和退出码;没跑的不要写成通过 / commands actually run and exit codes -->

## 版权检查 · Copyright

- [ ] 没有搬运原文段落;引用都是短句并附原文链接 / no copied passages; quotes are short and linked
- [ ] 复用的 MIT 内容放在 `third_party/` 并保留许可声明,已更新 `THIRD_PARTY_NOTICES.md` / reused MIT material lives in `third_party/` with its notice
- [ ] `node scripts/check-overlap.mjs` 已在有原始语料的环境里跑过 / overlap guard run locally with raw corpus

---
评审会按根目录 `CODING_STANDARDS.md` 逐条核对 diff。Reviewers check the diff against `CODING_STANDARDS.md`.
