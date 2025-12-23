# Astro Blog Zozo

一个基于 [Astro](https://astro.build) 构建的简洁、个性化的博客主题。该主题移植自 [hugo-theme-zozo](https://github.com/varkai/hugo-theme-zozo)。

✨ [在线演示](https://astro-blog-zozo.pages.dev/) ✨

<div align="center">
  <a href="https://astro-blog-zozo.pages.dev/">
    <img src="./screenshot-light.png" alt="Light Mode" height="300">
  </a>
  <a href="https://astro-blog-zozo.pages.dev/">
    <img src="./screenshot-dark.png" alt="Dark Mode" height="300">
  </a>
</div>

## ✨ 特性

- **极速轻量**: 桌面端 Lighthouse 评分 4 * 100/100。
- **Astro 5**: 使用最新的 Astro 框架构建。
- **零 UI 框架**: 为了更好的性能，未集成 React/Vue 等重型框架（仅构建时使用）。
- **响应式设计**: 使用 [Tailwind CSS](https://tailwindcss.com/) 适配移动端。
- **深色/浅色模式**: 移植自 hugo-theme-zozo 的经典配色。
- **Markdown 支持**: 支持 Emoji 短代码, KaTeX 数学公式。
- **静态搜索**: 集成 [Pagefind](https://pagefind.app) 实现全文搜索。
- **评论系统**: 由 [giscus](https://github.com/giscus/giscus) 提供支持。
- **SEO 友好**: 自动生成规范 URL (Canonical URLs) 和 OpenGraph 数据。
- **RSS & Sitemap**: 自动生成 RSS 订阅源和站点地图。
- **动态 OG 图片**: 自动生成文章的 Open Graph 预览图。
- **高度可配置**: 通过 [config](./src/config.ts) 轻松隐藏或修改元素。

## 🚀 快速开始

### 前置要求

本项目推荐使用 [Bun](https://bun.sh/) 作为包管理器。

### 安装

1. 克隆仓库：

```bash
git clone https://github.com/nianyi778/nianyi778.github.io.git
cd nianyi778.github.io
```

2. 安装依赖：

```bash
bun install
```

### 开发

启动本地开发服务器：

```bash
bun run dev
```

访问 `http://localhost:4321` 查看效果。

### 构建

构建生产环境版本：

```bash
bun run build
```

### 预览

预览构建后的产物：

```bash
bun run preview
```

## ⚙️ 配置

主要配置文件位于 `src/config.ts`。你可以在这里修改博客的基本信息、导航栏、社交链接等。

## 📝 待办事项

- [ ] `@shikijs/transformers` 需要自定义样式
- [ ] 国际化 (i18n) 支持

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT](./LICENSE)

## 🙏 致谢

- [varkai/hugo-theme-zozo](https://github.com/varkai/hugo-theme-zozo)
- [Charca/astro-blog-template](https://github.com/Charca/astro-blog-template)
- [satnaing/astro-paper](https://github.com/satnaing/astro-paper)
- [ricora/alg.tus-ricora.com](https://github.com/ricora/alg.tus-ricora.com)
- [one-aalam/astro-ink](https://github.com/one-aalam/astro-ink)
