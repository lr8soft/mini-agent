// Deutsch
export default {
  app: {
    name: 'MiniAgent'
  },
  sidebar: {
    newSession: 'Neue Sitzung',
    noSessions: 'Keine Sitzungen',
    deleteSession: 'Sitzung löschen',
    settings: 'Einstellungen'
  },
  chat: {
    createSessionToStart: 'Erstellen Sie eine Sitzung, um zu chatten',
    newSession: 'Neue Sitzung',
    session: 'Sitzung',
    autoApproveOn: 'Auto-Genehmigen: AN',
    autoApproveOff: 'Auto-Genehmigen: AUS',
    autoApproveOnHint: 'Auto-Genehmigen AN: alle Tool-Aufrufe überspringen Berechtigungen',
    autoApproveOffHint: 'Auto-Genehmigen AUS: Tools benötigen Berechtigung',
    thinking: 'Denke nach...',
    stop: 'Stopp',
    send: 'Senden',
    welcome: 'Geben Sie unten eine Nachricht ein, um eine Konversation zu starten.',
    welcomeHint: 'Der Agent kann Dateien lesen, Befehle ausführen und MCP-Tools verwenden.',
    inputPlaceholder: 'Nachricht senden... (Enter zum Senden, Shift+Enter für neue Zeile)',
    defaultModel: '(Standardmodell)',
    selectModelHint: 'Modell auswählen (leer = Anbieter-Standard)',
    modelDefaultSuffix: '(Standard)'
  },
  permission: {
    title: 'Berechtigungsanfrage',
    description: 'Der Agent möchte ein Tool ausführen, das Ihr System ändern könnte:',
    allow: 'Erlauben',
    deny: 'Ablehnen'
  },
  message: {
    error: 'Fehler',
    collapse: 'Einklappen',
    expand: 'Ausklappen'
  },
  settings: {
    title: 'Einstellungen',
    tabs: {
      providers: 'LLM-Anbieter',
      mcp: 'MCP-Server',
      skills: 'Skills',
      memory: 'Gedächtnis',
      general: 'Allgemein'
    },
    save: 'Einstellungen speichern',
    providers: {
      hint: 'Konfigurieren Sie LLM-Anbieter. Jeder OpenAI-kompatible Endpunkt funktioniert (Ollama, vLLM, OpenAI, Anthropic, etc.).',
      zhuminetBanner: 'KI-Modell-API-Dienst, Registrierung mit kostenlosem Guthaben',
      zhuminetRegister: 'Registrieren →',
      name: 'Name',
      defaultModel: 'Standardmodell',
      baseUrl: 'Base URL',
      apiKey: 'API Key',
      apiKeyPlaceholder: '(optional für lokal)',
      enabled: 'Aktiviert',
      temperature: 'Temperatur',
      temperatureHint: 'Standard 1.0. Niedrig = fokussiert, hoch = kreativ.',
      temperatureReset: 'Zurücksetzen',
      reasoningEffort: 'Begründungsintensität',
      reasoningLow: 'niedrig — schnell, weniger Denken',
      reasoningMedium: 'mittel — ausgeglichen',
      reasoningHigh: 'hoch — tiefes Reasoning',
      addProvider: '+ Anbieter hinzufügen',
      remove: 'Entfernen',
      active: 'Aktiv',
      activate: 'Klicken zum Aktivieren'
    },
    mcp: {
      hint: 'Konfigurieren Sie MCP-Server (Model Context Protocol) für erweiterte Tool-Fähigkeiten.',
      name: 'Name',
      type: 'Typ',
      command: 'Befehl',
      commandHint: 'Nur ausführbare Datei. Flags/Pfade unten in Args.',
      args: 'Args (leerzeichengetrennt)',
      env: 'Env (KEY=VALUE, eine pro Zeile)',
      url: 'URL',
      addServer: '+ MCP-Server hinzufügen',
      remove: 'Entfernen'
    },
    skills: {
      hint: 'Laden Sie SKILL.md-Dateien, um spezialisierte Prompts in den Agent zu injizieren.',
      addSkill: '+ Skill hinzufügen (.md-Datei auswählen)',
      on: 'An',
      off: 'Aus',
      remove: 'Entfernen'
    },
    memory: {
      hint: 'Langzeitgedächtnis-Einträge, die automatisch aus Konversationen erfasst wurden. Der Agent verwendet diese, um Antworten zu personalisieren.',
      clearAll: 'Alle löschen',
      searchPlaceholder: 'Gedächtnis durchsuchen...',
      allCategories: 'Alle Kategorien',
      noMemories: 'Noch keine Gedächtniseinträge. Werden automatisch beim Chatten erfasst.',
      noMatch: 'Keine Gedächtniseinträge passen zum Filter.',
      delete: 'Löschen',
      accessed: 'Zugegriffen',
      times: 'x',
      preference: 'Präferenz',
      habit: 'Gewohnheit',
      fact: 'Fakt',
      skill: 'Fähigkeit',
      context: 'Kontext'
    },
    general: {
      workspacePath: 'Workspace-Pfad',
      browse: 'Durchsuchen',
      workspaceHint: 'Stammverzeichnis für die Agent-Arbeit. Datei-Tools sind relativ zu diesem Pfad.',
      language: 'Sprache',
      languageHint: 'Interface-Sprache. Erkennt Systemsprache beim ersten Start automatisch.',
      autoDetect: 'Auto (System)'
    }
  }
}
