# Astro Blog Zozo - AI Coding Instructions

## Project Overview
This is a personal blog built with **Astro 5**, **Tailwind CSS**, and **TypeScript**. It is a port of the `hugo-theme-zozo` theme.
- **Package Manager**: [Bun](https://bun.sh/) is the preferred package manager.
- **Styling**: Tailwind CSS with `lxgw-wenkai-screen-web` font.
- **Linting/Formatting**: [Biome](https://biomejs.dev/).

## Architecture & Key Components

### Directory Structure
- `src/content/posts/`: Markdown content for blog posts.
- `src/pages/`: File-based routing.
- `src/layouts/`:
  - `BaseLayout.astro`: Root layout handling SEO, `<head>`, and global styles.
  - `MarkdownLayout.astro`: For rendering markdown content.
  - `ScaffoldLayout.astro`: Structural layout.
- `src/config.ts`: Central configuration for site metadata, socials, and comments.
- `src/utils/`: Helper functions (URL handling, SEO, etc.).

### Content Collections
- Defined in `src/content/config.ts`.
- **Collection**: `posts`.
- **Schema**: Includes `title`, `date`, `tags`, `hide` (array of elements to hide), etc.
- **Frontmatter**: Supports hiding specific UI elements via `hide: ['toc', 'comments']`.

### Configuration
- **Site Config**: Modify `src/config.ts` for `SiteTitle`, `Socials`, `GiscusConfig`.
- **Socials**: Defined as a record in `src/config.ts` and rendered in `Header.astro`.

## Development Workflows

### Commands
- **Dev Server**: `bun run dev` (wraps `astro dev`)
- **Build**: `bun run build` (runs checks + build)
- **Lint/Format**: `bunx @biomejs/biome check --write .`
- **Type Check**: `bun run check` (wraps `astro check`)

### Styling
- Use Tailwind utility classes.
- Global styles are imported in `BaseLayout.astro`.
- Dark mode is supported via Tailwind's `dark` variant and handled by `ThemeToggler.astro`.

## Coding Conventions

### TypeScript & Imports
- Use `~/` alias for `src/` imports (e.g., `import { Site } from '~/config';`).
- Ensure strict type safety, especially for props in Astro components.

### Astro Components
- **Props Interface**: Define `interface Props` for all components.
- **SEO**: Pass SEO-related props (`title`, `description`, `ogType`) to `BaseLayout`.
- **Images**: Use Astro's optimized image handling where possible.

### URL Handling
- Always use `withBase` from `~/utils/url` when constructing internal links to ensure correct base path handling.
  ```typescript
  import { withBase } from '~/utils/url';
  const link = withBase('/about');
  ```

### Comments (Giscus)
- Configured in `src/config.ts`.
- Rendered via `src/components/Comments.astro`.
- Controlled via frontmatter `hide: ['comments']`.

## Common Tasks

### Adding a New Post
1. Create a `.md` file in `src/content/posts/`.
2. Add required frontmatter: `title`, `date`.
3. Optional: `tags`, `description`, `hide`.

### Modifying Site Metadata
- Edit `src/config.ts` to update author, description, or social links.
