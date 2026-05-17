# Dev Container

This directory configures a [Dev Container](https://containers.dev/) — a reproducible development environment that runs in Docker (locally via VS Code Remote Containers) or in the cloud via GitHub Codespaces.

## What it gets you

✅ Node 20 + pnpm 10 pre-installed
✅ TypeScript + ESLint + Prettier + Tailwind language servers
✅ `git` and `gh` CLIs
✅ Auto `pnpm install --frozen-lockfile` on first start
✅ Forwarded port 5173 (Vite dev server)

## How to use

### GitHub Codespaces (cloud, fastest path)

Just click → **Code** → **Codespaces** → **Create codespace on main** on the repo page.

A fully ready environment spins up in ~90 seconds. You can run:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm dev:renderer   # Vite alone (Electron requires native UI — won't work in container)
```

### VS Code Remote Containers (local Docker)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. Install [VS Code Remote Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
3. Open this repo in VS Code → Cmd+Shift+P → **Reopen in Container**

## What it does NOT give you

⚠️ **You cannot run Electron's GUI inside the container.** Linux containers don't have a Mac/Windows desktop, and X11 forwarding for Electron is fragile.

Use the container for:
- ✅ Typecheck, lint, build
- ✅ Reading + editing code
- ✅ Running CLI scripts (`pnpm test:agents`, `pnpm verify:p0`)
- ✅ Vite renderer-only dev (`pnpm dev:renderer` — browser preview)

For actual app UI testing, you'll need a Mac (Apple Silicon or Intel) and `pnpm dev`.

## Customizing

Edit `devcontainer.json` to:
- Add more VS Code extensions in `customizations.vscode.extensions`
- Pin a different Node version (change the image tag)
- Add additional features (e.g. AWS CLI, Postgres) via `features`

After editing, run **Cmd+Shift+P → Dev Containers: Rebuild Container** for changes to apply.
