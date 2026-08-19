# MiniAgent

<p align="center">
  <img src="https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-22.12%2B-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6" alt="Platform" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
</p>

<p align="center">
  <strong>桌面端 AI 编码智能体平台</strong> —— 类似 OpenCode / Codex，完全本地运行、模型厂商无关
</p>

<p align="center">
  <a href="./README.md">English</a> | <strong>简体中文</strong>
</p>

---

## 目录

- [特性](#特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [架构](#架构)
- [键盘快捷键](#键盘快捷键)
- [许可证](#许可证)

## 特性

- **任意 LLM、任意端点** —— 支持所有 OpenAI 兼容 API（OpenAI、Ollama、vLLM、DeepSeek 等），无厂商锁定。
- **ReAct 智能体循环** —— 完整的工具调用闭环：LLM → 工具调用 → 执行 → 结果回传 → 继续推理（单轮对话最多 20 次工具调用）。
- **内置文件工具** —— `read` / `write` / `edit` / `bash` / `grep` / `glob` / `ls` / `set_title`，全部在本地执行。
- **浏览器自动化** —— 内置无头 Chromium（Playwright 随安装包分发）：`browser_navigate` / `browser_click` / `browser_type` / `browser_screenshot` / `browser_get_text` / `browser_get_html` / `browser_wait` / `browser_close`。
- **桌面自动化** —— 鼠标 / 键盘 / 屏幕控制（robotjs）：`desktop_mouse_move` / `desktop_mouse_click` / `desktop_mouse_drag` / `desktop_mouse_scroll` / `desktop_key_tap` / `desktop_type_text` / `desktop_screenshot` / `desktop_screen_size` / `desktop_get_mouse_pos` / `desktop_get_pixel_color`。
- **MCP 工具扩展** —— 挂载 [Model Context Protocol](https://modelcontextprotocol.io/) 服务器（stdio + SSE），无限扩展工具能力（Playwright、文件系统、数据库等）。
- **技能注入** —— 加载带 frontmatter 的 `SKILL.md` 文件，向智能体注入专用系统提示词与工作流。
- **权限系统** —— 安全工具自动放行，危险工具需用户显式确认；提供"自动批准"开关。
- **自动上下文压缩** —— 上下文占用超过 60% 时自动压缩：早期消息由 LLM 摘要，近期消息保留原文，防止超出上下文窗口导致 400 错误。上下文窗口自动检测（llama.cpp `/v1/models`、Ollama `/api/show`）或手动指定。
- **长期记忆** —— 自动从对话中提取用户偏好、习惯与项目上下文并入库；按关键词检索相关记忆注入系统提示词，实现个性化响应。同时提供 `memory_search` / `memory_save` / `memory_list` / `memory_delete` 工具供 LLM 主动使用。
- **模型热切换** —— 在聊天输入栏即时切换模型，无需进入设置。
- **温度与推理强度** —— 每个 Provider 独立设置 temperature（0–2）与 reasoning effort（low / medium / high，可开关）。
- **多语言界面** —— 中文 / English / 日本語 / Español / Français / Deutsch，自动检测系统语言，可手动切换。
- **主题与字号** —— 浅色 / 深色 / 跟随系统；字号 13–18px 可调。
- **Token 用量统计** —— 每次 LLM 调用自动记录 token 用量：按模型汇总 + 近 30 天趋势图。
## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面外壳 | Electron 43 |
| 构建 | electron-vite + Vite 7 + electron-builder |
| UI | React 19 + TypeScript 5.9（原生 CSS，无 UI 框架） |
| 状态管理 | Zustand |
| 国际化 | i18next + react-i18next（6 语言） |
| LLM 调用 | 原生 fetch（OpenAI 兼容 `/chat/completions`，SSE 流式） |
| 浏览器自动化 | Playwright（Chromium，随安装包内置） |
| 桌面自动化 | robotjs |
| MCP | `@modelcontextprotocol/sdk` |
| 本地存储 | better-sqlite3 |
| 技能解析 | gray-matter（frontmatter） |

## 快速开始

### 环境要求

- Windows 10 / 11
- Node.js 22.12+（推荐 24 LTS）
- npm

### 安装

```bash
npm install
```

> `postinstall` 会自动配置 Electron 国内镜像并下载 Playwright Chromium（内置到 `node_modules/playwright-core/.local-browsers`）。
>
> 如 Electron 下载缓慢，可手动设置镜像后重试：
>
> ```powershell
> $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
> npm install
> ```

### 开发

```bash
npm run dev
```

以开发模式启动应用，支持热更新与 DevTools。

### 构建

```bash
npm run build
```

### 打包 Windows 安装包

```bash
npm run build:win
```

安装包输出到 `release/` 目录。

## 配置说明

打开设置页（侧边栏底部齿轮图标），共 6 个标签页：

### LLM Providers

| 字段 | 说明 |
|------|------|
| 名称 | 显示名称（如 "Ollama Local"） |
| Base URL | OpenAI 兼容端点（如 `http://localhost:11434/v1`） |
| API Key | 本地 Provider 可留空 |
| 默认模型 | 模型名（如 `qwen2.5:14b`） |
| Temperature | 0–2，越低越专注，越高越发散 |
| 推理强度 | low / medium / high（可开关）—— 适用于 DeepSeek-R1、OpenAI o 系列等 |
| 上下文窗口 | 模型最大 token 数（0 = 自动检测）。占用超过 60% 时触发自动压缩 |

### MCP Servers

**stdio 模式**（本地进程）：

- **Command**：可执行文件（如 `npx`）
- **Args**：空格分隔的参数（如 `-y @playwright/mcp@latest`）
- **Env**：每行一个 `KEY=VALUE`

**SSE 模式**（远程服务器）：

- **URL**：端点地址（如 `https://mcp.example.com/sse`）

### Skills

选择任意带 frontmatter 的 `.md` 文件，其内容将注入智能体的系统提示词。

### Memory（长期记忆）

自动从对话中捕获用户偏好、习惯、工作风格与项目上下文。

- **分类**：preference / habit / fact / skill / context（各带 1–5 重要性）
- **自动提取**：每轮对话结束后由 LLM 分析并提取值得记忆的信息
- **智能检索**：按当前用户消息的关键词匹配，将相关记忆注入系统提示词
- **去重**：相似记忆自动跳过
- **可管理**：在设置 > Memory 中查看、搜索、筛选、删除、调整重要性

### Usage（用量统计）

每次 LLM 调用自动记录输入 / 输出 token：按模型汇总表 + 近 30 天每日趋势图。

### General（通用）

- **外观**：主题（浅色 / 深色 / 跟随系统）与字号（13–18px）
- **语言**：界面语言（自动检测或手动指定）
- **工作目录**：文件操作根目录，所有文件工具均相对该路径
## 架构

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

### Agent 流程（ReAct 循环）

```
用户输入
    │
    ▼
┌─────────┐    tool_calls?    ┌──────────┐
│   LLM   │ ──── yes ──────► │ 执行工具  │
│ (流式)  │                   └────┬─────┘
└─────────┘                        │ 结果
    ▲ no                           ▼
    │                          ┌─────────┐
    └─── 最终回答 ◄─────────── │   LLM   │
                               │ (下一轮) │
                               └─────────┘
```

单轮对话最多 20 次工具调用，防止无限循环。

### 自动压缩流程

```
发送给 LLM 前
        │
        ▼
┌──────────────────┐
│ 估算 token 数    │
│ (字符数 / 4)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ token 超过上下文 │─── 否 ───► 直接发送给 LLM
│ 窗口的 60%？     │
└────────┬─────────┘
         │ 是
         ▼
┌──────────────────┐
│ 拆分消息：       │
│ - 保留 system    │
│ - 保留最近 8 条  │
│ - 其余由 LLM     │
│   生成摘要       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 用摘要替换早期   │
│ 消息             │
└────────┬─────────┘
         │
         ▼
    发送给 LLM
```

### 记忆流程（长期）

```
用户消息
    │
    ▼
┌──────────────────┐    ┌──────────────────┐
│ 检索相关记忆     │    │ 记忆库 (SQLite)  │
│ (关键词 + 重要性)│◄───│ - preference     │
└────────┬─────────┘    │ - habit          │
         │              │ - fact           │
         ▼              │ - skill          │
┌──────────────────┐    │ - context        │
│ 注入系统提示词   │    └──────────────────┘
└────────┬─────────┘
         │
         ▼
    ┌─────────┐
    │   LLM   │
    │ (流式)  │
    └────┬────┘
         │ 对话完成后
         ▼
┌──────────────────┐
│ 提取记忆         │
│ (LLM 分析)       │
└────────┬─────────┘
         │ 去重
         ▼
┌──────────────────┐
│ 写入数据库       │
└──────────────────┘
```

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift+Enter` | 输入框内换行 |
| `Ctrl+N` | 新建会话 |

## 许可证

[MIT](https://opensource.org/licenses/MIT)
