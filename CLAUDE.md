# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ovo is an Electron-based proactive AI desktop assistant. The app runs multiple windows: a main console window, a floating icon, and a suggestion panel. It integrates OCR, TTS, knowledge graph, and Claude API for AI capabilities.

## Common Commands

```bash
# Development
pnpm dev                    # Start both renderer and electron in dev mode
pnpm dev:renderer           # Start Vite dev server only (port 5173)
pnpm dev:electron           # Start Electron with live reload

# Build
pnpm build                  # Build both renderer and electron
pnpm build:renderer         # Build React/Vite frontend
pnpm build:electron         # Compile TypeScript to electron/

# Type checking and linting
pnpm typecheck              # Run TypeScript on both renderer and electron
pnpm lint                   # Run ESLint

# Testing
pnpm test:agents            # Run agent smoke tests (scripts/smoke-agents.ts)
pnpm verify:p0             # Run P0 verification script
pnpm verify:real30         # Run 30-scenario real log verification

# Packaging
pnpm pack:dir               # Package as unpacked directory
pnpm pack:mac               # Package as macOS DMG
pnpm pack:all               # Package for all platforms

# CI
pnpm test:ci                # typecheck && lint && build && test:agents
```

## Architecture

### Electron Process (electron/)
- **main.ts**: Entry point, creates BrowserWindows for console (#console), floating (#float), and suggestion (#panel) windows
- **preload.cjs**: Context bridge exposing IPC APIs to renderer
- **ipc-handlers.ts**: Central IPC handler registration
- **window-manager.ts**: Window lifecycle management
- **agent-bridge.ts**: Claude API communication
- **pipeline-logger.ts**: Logging pipeline stages
- **knowledge-graph.ts**: SQLite-based entity relationship storage (better-sqlite3)
- **ocr-engine.ts**: Tesseract.js OCR integration
- **tts-engine.ts**: Text-to-speech functionality
- **action-executor.ts**: Executes AI-suggested actions
- **screenshot.ts**: Screen capture functionality

### Renderer Process (src/)
- **App.tsx**: Routes to different components based on URL hash (#console, #float, #panel)
- **stores/**: Zustand state management
  - runtimeStore.ts: Runtime state (active pipeline, logs)
  - suggestionStore.ts: AI suggestions state
  - settingsStore.ts: User preferences
  - windowStore.ts: Window state
  - pipelineStore.ts: Pipeline stage tracking
- **hooks/**: React hooks wrapping electron IPC
- **components/Console/**: Main console UI components
- **components/SuggestionPanel/**: Suggestion panel UI
- **components/FloatingIcon/**: Floating widget UI

### Data Flow
1. Auto-capture (electron/auto-capture.ts) takes screenshots periodically
2. OCR extracts text from screenshots
3. Event processor analyzes screen content
4. Prompt engine constructs prompts for Claude
5. Agent bridge calls Claude API
6. Suggestion engine generates actionable suggestions
7. User can execute suggestions via action executor

## Key Configuration

- **vite.config.ts**: Vite config with path aliases (@, @shared, @types)
- **tsconfig.electron.json**: TypeScript config for electron/
- Renderer uses ESM, electron uses CommonJS (via esbuild)
- Database stored via electron-store and better-sqlite3
