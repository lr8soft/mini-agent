// English (baseline)
export default {
  app: {
    name: 'MiniAgent'
  },
  window: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close'
  },
  sidebar: {
    newSession: 'New session',
    noSessions: 'No sessions yet',
    deleteSession: 'Delete session',
    settings: 'Settings'
  },
  chat: {
    createSessionToStart: 'Create a session to start chatting',
    newSession: 'New Session',
    session: 'Session',
    autoApproveOn: 'Auto-Approve: ON',
    autoApproveOff: 'Auto-Approve: OFF',
    autoApproveOnHint: 'Auto-approve ON: all tool calls skip permission',
    autoApproveOffHint: 'Auto-approve OFF: tools need permission',
    thinking: 'Thinking...',
    retrying: 'Network unstable, retrying ({{attempt}}/{{max}})…',
    stop: 'Stop',
    send: 'Send',
    welcome: 'Type a message below to start a conversation.',
    welcomeHint: 'The agent can read files, run commands, and use MCP tools.',
    inputPlaceholder: 'Send a message... (Enter to send, Shift+Enter for newline)',
    workspace: 'Workspace',
    changeWorkspace: 'Change',
    defaultModel: '(Default Model)',
    selectModelHint: 'Select model (empty = provider default)',
    modelDefaultSuffix: '(default)'
  },
  permission: {
    title: 'Permission Request',
    description: 'The agent wants to execute a tool that may modify your system:',
    allow: 'Allow',
    deny: 'Deny'
  },
  message: {
    error: 'Error',
    collapse: 'Collapse',
    expand: 'Expand'
  },
  settings: {
    title: 'Settings',
    tabs: {
      providers: 'LLM Providers',
      mcp: 'MCP Servers',
      skills: 'Skills',
      memory: 'Memory',
      usage: 'Usage',
      general: 'General'
    },
    save: 'Save Settings',
    providers: {
      hint: 'Configure LLM providers. Any OpenAI-compatible endpoint works (Ollama, vLLM, OpenAI, Anthropic, etc.).',
      zhuminetBanner: 'All-in-one AI model API service. Sign up to get free credits.',
      zhuminetRegister: 'Sign up →',
      name: 'Name',
      defaultModel: 'Default Model',
      baseUrl: 'Base URL',
      apiKey: 'API Key',
      apiKeyPlaceholder: '(optional for local)',
      enabled: 'Enabled',
      temperature: 'Temperature',
      temperatureHint: 'Leave at 1.0 for default. Lower = focused, higher = creative.',
      temperatureReset: 'Reset',
      reasoningEffort: 'Reasoning Effort',
      reasoningLow: 'low — fast, less thinking',
      reasoningMedium: 'medium — balanced',
      reasoningHigh: 'high — deep reasoning',
      addProvider: '+ Add Provider',
      remove: 'Remove',
      active: 'Active',
      activate: 'Click to activate',
      contextWindow: 'Context Window',
      contextWindowAuto: 'Auto',
      contextWindowHint: 'Max tokens for the model (0 = auto-detect from API). Auto compact triggers at 60% usage.'
    },
    mcp: {
      hint: 'Configure MCP (Model Context Protocol) servers for extended tool capabilities.',
      name: 'Name',
      type: 'Type',
      command: 'Command',
      commandHint: 'Executable only. Put flags/paths in Args below.',
      args: 'Args (space-separated)',
      env: 'Env (KEY=VALUE, one per line)',
      url: 'URL',
      authType: 'Authentication',
      authNone: 'None',
      authBearer: 'Bearer Token',
      authApiKey: 'API Key',
      authCustom: 'Custom Headers',
      authToken: 'Bearer Token',
      authHeader: 'Header Name',
      apiKey: 'API Key',
      customHeaders: 'Custom Headers (one per line, Key: Value)',
      addServer: '+ Add MCP Server',
      remove: 'Remove'
    },
    skills: {
      hint: 'Load Skill definitions (SKILL.md files) to inject specialized prompts into the agent.',
      addSkill: '+ Add Skill (pick .md file)',
      on: 'On',
      off: 'Off',
      remove: 'Remove'
    },
    memory: {
      hint: 'Long-term memory entries automatically captured from conversations. The agent uses these to personalize responses.',
      clearAll: 'Clear All',
      searchPlaceholder: 'Search memories...',
      allCategories: 'All Categories',
      noMemories: 'No memories yet. They will be automatically captured as you chat with the agent.',
      noMatch: 'No memories match your filter.',
      delete: 'Delete',
      accessed: 'Accessed',
      times: 'x',
      preference: 'Preference',
      habit: 'Habit',
      fact: 'Fact',
      skill: 'Skill',
      context: 'Context'
    },
    general: {
      workspacePath: 'Workspace Path',
      browse: 'Browse',
      workspaceHint: 'The root directory the agent will work in. File tools are relative to this path.',
      language: 'Language',
      languageHint: 'Interface language. Auto-detects system language on first launch.',
      autoDetect: 'Auto (System)',
      appearance: 'Appearance',
      appearanceHint: 'Theme and interface font size',
      theme: 'Theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      fontSize: 'Font Size',
      fontSizeHint: 'Scales all interface text. Applies immediately and is remembered.',
      fontSizeOption: '{{px}} px',
      network: 'Network',
      networkHint: 'Automatic retry policy for failed LLM requests and MCP connections.',
      maxRetries: 'Retries',
      maxRetriesHint: 'How many times to retry after a request fails. 0 = no retry. Delay grows from 1s up to 30s.',
      retriesUnlimited: 'Unlimited retries'
    },
    usage: {
      hint: 'Token usage statistics. Input/output tokens are recorded for each LLM call automatically.',
      noData: 'No usage data yet. Data will be recorded after you send messages.',
      model: 'Model',
      inputTokens: 'Input Tokens',
      outputTokens: 'Output Tokens',
      totalTokens: 'Total Tokens',
      requests: 'Requests',
      dailyChart: 'Daily Usage Trend (Last 30 Days)'
    }
  }
}
