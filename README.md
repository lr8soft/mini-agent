# Zhumora Agent

<p align="center">
  <img src="https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-22.12%2B-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6" alt="Platform" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
</p>

<p align="center">
  <strong>An open-source AI agent that can code, automate tasks, and operate your computer</strong>
</p>

<p align="center">
  <strong>English</strong> | <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [License](#license)

## Features

- **Any LLM, Any Endpoint** — Connect to any OpenAI-compatible API (OpenAI, Ollama, vLLM, DeepSeek, etc.). No vendor lock-in.
- **ReAct Agent Loop** — Full tool-calling loop: LLM → tool calls → execute → feed results back → continue (up to 20 tool rounds per conversation, configurable, with repeated-call loop detection and an automatic text-only summary when stopped).
- **Built-in File Tools** — `read` / `write` / `edit` / `bash` / `grep` / `glob` / `ls` / `set_title`, all running locally.
- **Browser Automation** — Bundled headless Chromium (Playwright ships with the installer): `browser_navigate` / `browser_click` / `browser_type` / `browser_screenshot` / `browser_get_text` / `browser_get_html` / `browser_wait` / `browser_close`.
- **Desktop Automation** — Mouse / keyboard / screen control (robotjs): `desktop_mouse_move` / `desktop_mouse_click` / `desktop_mouse_drag` / `desktop_mouse_scroll` / `desktop_key_tap` / `desktop_type_text` / `desktop_screenshot` / `desktop_screen_size` / `desktop_get_mouse_pos` / `desktop_get_pixel_color`.
- **MCP Tool Extension** — Mount [Model Context Protocol](https://modelcontextprotocol.io/) servers (stdio + SSE) for unlimited tool capabilities (Playwright, filesystem, databases, etc.).
- **Skill Injection** — Load `SKILL.md` files with frontmatter to inject specialized system prompts and workflows into the agent.
- **Permission System** — Safe tools are auto-approved; dangerous tools require explicit user confirmation. Auto-approve toggle for power users.
- **Auto Compact** — When context usage exceeds 60%, history is automatically compressed: early messages are summarized by the LLM while recent messages are kept intact, preventing 400 errors from exceeding the context window. Context window is auto-detected from the provider's API (`/v1/models` meta for llama.cpp, `/api/show` for Ollama) or set manually.
- **Long-term Memory** — Automatically extracts user preferences, habits, and project context from conversations into a local database; relevant memories are retrieved by keyword and injected into the system prompt for personalized responses. Also exposes `memory_search` / `memory_save` / `memory_list` / `memory_delete` tools for the LLM to use proactively.
- **Model Switching** — Switch models on the fly from the chat bar without changing settings.
- **Temperature & Reasoning Effort** — Per-provider temperature (0–2) and reasoning effort (low / medium / high, toggleable).
- **Multilingual UI** — 中文 / English / 日本語 / Español / Français / Deutsch, with automatic system-language detection and manual override.
- **Themes & Font Size** — Light / Dark / Follow system; adjustable font size (13–18px).
- **Token Usage Stats** — Every LLM call is recorded automatically: per-model summary + 30-day trend chart.
## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 43 |
| Build | electron-vite + Vite 7 + electron-builder |
| UI | React 19 + TypeScript 5.9 (vanilla CSS, no UI framework) |
| State | Zustand |
| i18n | i18next + react-i18next (6 languages) |
| LLM | Native fetch (OpenAI-compatible `/chat/completions`, SSE streaming) |
| Browser | Playwright (Chromium, bundled with the installer) |
| Desktop | robotjs |
| MCP | `@modelcontextprotocol/sdk` |
| Storage | better-sqlite3 |
| Skills | gray-matter (frontmatter parsing) |

## Getting Started

### Prerequisites

- Windows 10 / 11
- Node.js 22.12+ (24 LTS recommended)
- npm

### Install

```bash
npm install
```

> `postinstall` automatically configures the Electron mirror (npmmirror) and downloads Playwright Chromium (bundled into `node_modules/playwright-core/.local-browsers`).
>
> If the Electron binary download is slow, set the mirror manually and retry:
>
> ```powershell
> $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
> npm install
> ```

### Development

```bash
npm run dev
```

Launches the app in dev mode with hot reload and DevTools.

### Build

```bash
npm run build
```

### Package for Windows

```bash
npm run build:win
```

Produces an NSIS installer in `release/`.

## Configuration

Open Settings (gear icon at the bottom of the sidebar) — 6 tabs:

### LLM Providers

| Field | Description |
|-------|-------------|
| Name | Display name (e.g. "Ollama Local") |
| Base URL | OpenAI-compatible endpoint (e.g. `http://localhost:11434/v1`) |
| API Key | Optional for local providers |
| Default Model | Model name (e.g. `qwen2.5:14b`) |
| Temperature | 0–2, lower = focused, higher = creative |
| Reasoning Effort | low / medium / high (toggleable) — for models like DeepSeek-R1, OpenAI o-series |
| Context Window | Max tokens for the model (0 = auto-detect). Auto compact triggers at 60% usage |

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

- **Categories**: preference, habit, fact, skill, context (each with 1–5 importance)
- **Auto-extraction**: After each conversation, the LLM analyzes the dialog and extracts memorable info
- **Smart retrieval**: Relevant memories are injected into the system prompt based on keyword matching with the current user message
- **Deduplication**: Similar memories are automatically skipped
- **Manageable**: View, search, filter, delete, and adjust importance from Settings > Memory

### Usage (Token Stats)

Every LLM call records input / output tokens automatically: per-model summary table + 30-day daily trend chart.

### General

- **Appearance**: theme (light / dark / follow system) and font size (13–18px)
- **Language**: UI language (auto-detect or manual)
- **Workspace Path**: root directory for file operations; all file tools are relative to this path
## Architecture

```
┌─────────────────────────────────────────────┐
│               Electron Main                 │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ LLM      │ │ Agent    │ │ MCP        │  │
│  │ Provider │ │ Runner   │ │ Client     │  │
│  │ (fetch)  │ │ (ReAct)  │ │ (SDK)      │  │
│  └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
│       │            │             │         │
│  ┌────┴────────────┴─────────────┴──────┐  │
│  │            Tool Registry             │  │
│  │ (builtin + browser + desktop +       │  │
│  │  memory + MCP + skill prompts)       │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │            SQLite Store              │  │
│  │ (sessions + messages + settings +    │  │
│  │  memory_entries + token_usage)       │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │           Memory Manager             │  │
│  │ (extractor + retrieval +             │  │
│  │  prompt injection)                   │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │           Context Manager            │  │
│  │ (token estimation + auto compact     │  │
│  │  at 60% threshold)                   │  │
│  └──────────────────────────────────────┘  │
│                  IPC Bridge                │
├─────────────────────────────────────────────┤
│             Preload (contextBridge)         │
├─────────────────────────────────────────────┤
│             React Renderer                  │
│  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Sidebar │ │ ChatView │ │ SettingsView│  │
│  │(sessions)│(messages) │ │  (6 tabs)   │  │
│  └─────────┘ └──────────┘ └─────────────┘  │
│  ┌──────────────────────────────────────┐   │
│  │     Zustand Store (global state)     │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
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
    ▲ no                           │ results
    │                              ▼
    └─── final answer ◄────────── ┌─────────┐
                                  │   LLM   │
                                  │ (next)  │
                                  └─────────┘
```

Max 20 tool rounds per conversation to prevent infinite loops.

### Auto Compact Flow

```
Before sending to LLM
        │
        ▼
┌──────────────────┐
│ Estimate tokens  │
│ (chars / 4)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ tokens > 60% of  │─── no ───► Send messages to LLM
│ context window?  │
└────────┬─────────┘
         │ yes
         ▼
┌──────────────────┐
│ Split messages:  │
│ - Keep system    │
│ - Keep last 8    │
│ - Summarize rest │
│   via LLM        │
└────────┬─────────┘
 Note: the split point is aligned to full tool-call
 rounds so the compacted sequence stays protocol-valid
         │
         ▼
┌──────────────────┐
│ Replace old msgs │
│ with summary     │
└────────┬─────────┘
         │
         ▼
    Send to LLM
```

### Memory Flow (Long-term)

```
User Message
    │
    ▼
┌──────────────────┐    ┌──────────────────┐
│ Retrieve relevant│    │ Memory DB        │
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

[MIT](https://opensource.org/licenses/MIT)

