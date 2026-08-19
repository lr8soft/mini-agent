
# MiniAgent

A desktop AI coding agent platform built with Electron + React + TypeScript. Like OpenCode/Codex, but fully local and provider-agnostic.

## Features

- **Any LLM, Any Endpoint** — Connect to any OpenAI-compatible API (OpenAI, Ollama, vLLM, DeepSeek, etc.). No vendor lock-in.
- **MCP Tool Extension** — Mount [Model Context Protocol](https://modelcontextprotocol.io/) servers (stdio + SSE) for unlimited tool capabilities (Playwright, filesystem, databases, etc.).
- **Skill Injection** — Load `SKILL.md` files to inject specialized system prompts and workflows into the agent.
- **ReAct Agent Loop** — Full tool-calling loop: LLM → tool calls → execute → feed back → repeat (up to 20 rounds).
- **Built-in Tools** — `read`, `write`, `edit`, `bash`, `grep`, `glob`, `ls`, `set_title` — all running locally.
- **Permission System** — Safe tools auto-approved; dangerous tools require explicit user confirmation. Auto-approve toggle for power users.
- **Model Switching** — Switch models on-the-fly from the chat bar without changing settings.
- **Temperature & Reasoning Effort** — Per-provider temperature control and reasoning effort (low/medium/high) with toggle.
- **Browser Automation** — Headless Chromium via Playwright: `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, `browser_get_text`, `browser_get_html`, `browser_wait`, `browser_close`.
- **Long-term Memory** — Automatically extracts and stores user preferences, habits, and context from conversations via LLM. Injects relevant memories into system prompts for personalized responses.
- **Dark Terminal Aesthetic** — OpenCode-inspired UI with monospace fonts and purple accent.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 32 |
| Build | electron-vite |
| UI | React 18 + TypeScript + TailwindCSS |
| State | Zustand |
| LLM | Native fetch (OpenAI-compatible `/chat/completions`) |
| Browser | Playwright (Chromium, headless) |
| MCP | `@modelcontextprotocol/sdk` |
| Storage | better-sqlite3 |
| Skills | gray-matter (frontmatter parsing) |

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Install

```bash
npm install
```

> If Electron binary download is slow, set the mirror:
> ```bash
> $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
> npm install
> ```

### Development

```bash
npm run dev
```

This launches the app in dev mode with hot reload and DevTools.

### Build

```bash
npm run build
```

### Package for Windows

```bash
npm run build:win
```

Produces an installer in `release/`.

## Configuration

Open Settings (gear icon in sidebar) to configure:

### LLM Providers

| Field | Description |
|-------|-------------|
| Name | Display name (e.g. "Ollama Local") |
| Base URL | OpenAI-compatible endpoint (e.g. `http://localhost:11434/v1`) |
| API Key | Optional for local providers |
| Default Model | Model name (e.g. `qwen2.5:14b`) |
| Temperature | 0–2, lower = focused, higher = creative |
| Reasoning Effort | low/medium/high (toggle on/off) — for models like DeepSeek-R1, OpenAI o-series |

### MCP Servers

**stdio mode** (local process):
- **Command**: executable only (e.g. `npx`)
- **Args**: space-separated flags (e.g. `-y @playwright/mcp@latest`)
- **Env**: `KEY=VALUE` per line

**SSE mode** (remote server):
- **URL**: endpoint URL (e.g. `https://mcp.example.com/sse`)

### Skills

Pick any `.md` file with frontmatter + Markdown body. The content is injected into the agent's system prompt.

### Memory (Long-term)

Automatically captures user preferences, habits, working style, and project context from conversations.

- **Categories**: preference, habit, fact, skill, context (each with 1-5 importance)
- **Auto-extraction**: After each conversation, the LLM analyzes dialog and extracts memorable info
- **Smart retrieval**: Relevant memories are injected into the system prompt based on keyword matching with the current user message
- **Deduplication**: Similar memories are automatically skipped
- **Manageable**: View, search, filter, delete, and adjust importance from Settings > Memory tab

### General

- **Workspace Path**: Root directory for file operations. All file tools are relative to this path.

## Architecture

```
┌─────────────────────────────────────────┐
│              Electron Main               │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  │
│  │ LLM     │  │ Agent    │  │ MCP    │  │
│  │ Provider│  │ Runner   │  │ Client │  │
│  │ (fetch) │  │ (ReAct)  │  │ (SDK)  │  │
│  └────┬────┘  └────┬─────┘  └───┬────┘  │
│       │           │            │        │
│  ┌────┴───────────┴────────────┴────┐   │
│  │         Tool Registry             │   │
│  │  (builtin + MCP + skill prompts)  │   │
│  └───────────────────────────────────┘   │
│  ┌───────────────────────────────────┐   │
│  │         SQLite Store              │   │
│  │  (sessions + messages + settings  │   │
│  │   + memory_entries)               │   │
│  └───────────────────────────────────┘   │
│  ┌───────────────────────────────────┐   │
│  │       Memory Manager              │   │
│  │  (extractor + retrieval +        │   │
│  │   prompt injection)               │   │
│  └───────────────────────────────────┘   │
│                 IPC Bridge               │
├─────────────────────────────────────────┤
│              Preload (contextBridge)      │
├─────────────────────────────────────────┤
│              React Renderer               │
│  ┌────────┐ ┌──────────┐ ┌────────────┐  │
│  │Sidebar │ │ChatView  │ │SettingsView│  │
│  │(sessions)│(messages)│ │(5 tabs)   │  │
│  └────────┘ └──────────┘ └────────────┘  │
│  ┌──────────────────────────────────┐    │
│  │     Zustand Store (global state)  │    │
│  └──────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Agent Flow (ReAct Loop)

```
User Input
    │
    ▼
┌─────────┐    tool_calls?    ┌──────────┐
│   LLM   │ ──── yes ──────► │ Execute  │
│ (stream)│                   │ Tools    │
└─────────┘                   └────┬─────┘
    ▲ no                          │ results
    │                             ▼
    │                        ┌─────────┐
    └─── final answer ◄──── │   LLM   │
                             │ (next)  │
                             └─────────┘
```

Max 20 rounds per conversation to prevent infinite loops.

### Memory Flow (Long-term)

```
User Message
    │
    ▼
┌──────────────────┐    ┌──────────────────┐
│ Retrieve relevant│    │ Memory DB       │
│ memories (keyword│◄───│ (SQLite)         │
│ + importance)    │    │ - preference     │
└────────┬─────────┘    │ - habit          │
         │              │ - fact           │
         ▼              │ - skill          │
┌──────────────────┐    │ - context        │
│ Inject into      │    └──────────────────┘
│ System Prompt    │
└────────┬─────────┘
         │
         ▼
    ┌─────────┐
    │   LLM   │
    │ (stream)│
    └────┬────┘
         │ after completion
         ▼
┌──────────────────┐
│ Extract Memories │
│ (LLM analysis)   │
└────────┬─────────┘
         │ deduplicate
         ▼
┌──────────────────┐
│ Store to DB      │
└──────────────────┘
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line in input |
| `Ctrl+N` | New session |

## License

MIT
