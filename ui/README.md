# UI

React + TypeScript + ShadCN frontend, built with Vite. The CLI servers serve the compiled output — there is no standalone dev server.

## Architecture

The project uses Vite's **multi-page app (MPA)** mode. Each CLI server command (e.g. `live`) has its own entry point, but they all share components, hooks, and utilities.

```
live.html                  ← entry point HTML (one per server command)
src/
  live/
    main.tsx               ← React mount
    app.tsx                ← app shell
  components/
    ui/                    ← ShadCN components (auto-generated)
    breadcrumb-nav.tsx     ← shared components
    folder-table.tsx
    ...
  hooks/                   ← shared hooks
  lib/
    api.ts                 ← fetch wrapper
    utils.ts               ← ShadCN cn() utility
  globals.css              ← Tailwind + ShadCN theme
```

Entry HTML files live at the project root so Vite outputs them at `dist/<name>.html`. Each one references its source module (e.g. `./src/live/main.tsx`). New entry points are registered in `vite.config.ts` under `build.rollupOptions.input`.

## Adding an entry point

1. Create `<name>.html` at the project root and `src/<name>/main.tsx`
2. Add to `rollupOptions.input` in `vite.config.ts`
3. In the CLI server command, set `ENTRY_HTML` to `<name>.html`

## Scripts

```
npm run build   # type-check + production build
npm run dev     # watch mode (rebuilds on file changes)
```

## Dev workflow

```
Terminal 1: cd ui && nvm use && npm run dev
Terminal 2: cd cli && ./storage-cli live
```

Edit source → Terminal 1 rebuilds → refresh browser.

## Adding ShadCN components

```
npx shadcn@latest add @shadcn/<component>
```
