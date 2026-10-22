# Matt Pocock 学习笔记

[English](README.md)

一个中英双语的学习网站，内容来自 Matt Pocock 公开的帖子、文章和代码仓库，由我们用自己的话整理成一篇篇短课。

在线阅读：**https://matt.withkeya.com**

这是非官方、非商业的项目，和 Matt Pocock 本人没有隶属关系，也没有得到他的背书。想看原作，可以在 [X](https://x.com/mattpocockuk) 上关注他，读他的 [GitHub](https://github.com/mattpocock)，或者去 [AI Hero](https://www.aihero.dev) 学。

## 来源和版权

- 课程和摘要是我们自己的解读。引用只摘一两句，注明出处并链接到原帖或原页面。引用原话的版权归 Matt Pocock。
- 代码用 MIT 许可。我们自己写的内容（`content/`、`data/corpus-index.json`、`design/`）用 CC BY 4.0，转载请署名「matt-pocock-study contributors, https://github.com/ledondev520/matt-pocock-study」。
- 复用的文件只来自 MIT 许可的仓库，放在 `third_party/` 里，保留原来的版权和许可声明。
- 八个模板仓库和 `ai-hero-cli` 只放链接，不复用内容。字体保留 OFL 声明。

详见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 本地运行

需要 Node 22.23.4+ (22.x)：

```sh
npm ci
npm run dev
```

然后打开 Vite 打印出来的地址。构建、部署、测试、接口和内容规范见 [docs/maintainers.md](docs/maintainers.md)（英文）。
