// Français
export default {
  app: {
    name: 'MiniAgent'
  },
  sidebar: {
    newSession: 'Nouvelle session',
    noSessions: 'Aucune session',
    deleteSession: 'Supprimer la session',
    settings: 'Paramètres'
  },
  chat: {
    createSessionToStart: 'Créez une session pour commencer à discuter',
    newSession: 'Nouvelle Session',
    session: 'Session',
    autoApproveOn: 'Auto-Approuver: ON',
    autoApproveOff: 'Auto-Approuver: OFF',
    autoApproveOnHint: 'Auto-approuver ON: tous les appels d\'outils ignorent les permissions',
    autoApproveOffHint: 'Auto-approuver OFF: les outils nécessitent une permission',
    thinking: 'Réflexion...',
    stop: 'Arrêter',
    send: 'Envoyer',
    welcome: 'Tapez un message ci-dessous pour commencer une conversation.',
    welcomeHint: 'L\'agent peut lire des fichiers, exécuter des commandes et utiliser des outils MCP.',
    inputPlaceholder: 'Envoyez un message... (Enter pour envoyer, Shift+Enter pour nouvelle ligne)',
    defaultModel: '(Modèle par défaut)',
    selectModelHint: 'Sélectionner le modèle (vide = défaut du fournisseur)',
    modelDefaultSuffix: '(par défaut)'
  },
  permission: {
    title: 'Demande de Permission',
    description: 'L\'agent veut exécuter un outil qui peut modifier votre système:',
    allow: 'Autoriser',
    deny: 'Refuser'
  },
  message: {
    error: 'Erreur',
    collapse: 'Réduire',
    expand: 'Développer'
  },
  settings: {
    title: 'Paramètres',
    tabs: {
      providers: 'Fournisseurs LLM',
      mcp: 'Serveurs MCP',
      skills: 'Compétences',
      memory: 'Mémoire',
      general: 'Général'
    },
    save: 'Enregistrer',
    providers: {
      hint: 'Configurez les fournisseurs LLM. Tout endpoint compatible OpenAI fonctionne (Ollama, vLLM, OpenAI, Anthropic, etc.).',
      zhuminetBanner: 'Service API de modèles IA, inscription avec crédit gratuit',
      zhuminetRegister: 'S\'inscrire →',
      name: 'Nom',
      defaultModel: 'Modèle par Défaut',
      baseUrl: 'Base URL',
      apiKey: 'API Key',
      apiKeyPlaceholder: '(optionnel pour local)',
      enabled: 'Activé',
      temperature: 'Température',
      temperatureHint: 'Par défaut 1.0. Bas = concentré, haut = créatif.',
      temperatureReset: 'Réinitialiser',
      reasoningEffort: 'Intensité de Raisonnement',
      reasoningLow: 'bas — rapide, moins de réflexion',
      reasoningMedium: 'moyen — équilibré',
      reasoningHigh: 'haut — raisonnement approfondi',
      addProvider: '+ Ajouter Fournisseur',
      remove: 'Supprimer',
      active: 'Actif',
      activate: 'Cliquez pour activer',
      contextWindow: 'Fenêtre de Contexte',
      contextWindowAuto: 'Auto',
      contextWindowHint: 'Tokens max du modèle (0 = auto-détection). Compression auto à 60% d\'utilisation.'
    },
    mcp: {
      hint: 'Configurez les serveurs MCP (Model Context Protocol) pour des capacités d\'outils étendues.',
      name: 'Nom',
      type: 'Type',
      command: 'Commande',
      commandHint: 'Exécutable uniquement. Mettez les flags/chemins dans Args ci-dessous.',
      args: 'Args (séparés par espaces)',
      env: 'Env (KEY=VALUE, un par ligne)',
      url: 'URL',
      authType: 'Authentification',
      authNone: 'Aucune',
      authBearer: 'Bearer Token',
      authApiKey: 'API Key',
      authCustom: 'Headers Personnalisés',
      authToken: 'Bearer Token',
      authHeader: 'Nom du Header',
      apiKey: 'API Key',
      customHeaders: 'Headers personnalisés (un par ligne, Key: Value)',
      addServer: '+ Ajouter Serveur MCP',
      remove: 'Supprimer'
    },
    skills: {
      hint: 'Chargez les fichiers SKILL.md pour injecter des prompts spécialisés dans l\'agent.',
      addSkill: '+ Ajouter Compétence (choisir .md)',
      on: 'On',
      off: 'Off',
      remove: 'Supprimer'
    },
    memory: {
      hint: 'Entrées de mémoire à long terme capturées automatiquement des conversations. L\'agent les utilise pour personnaliser ses réponses.',
      clearAll: 'Tout Effacer',
      searchPlaceholder: 'Rechercher dans la mémoire...',
      allCategories: 'Toutes les Catégories',
      noMemories: 'Aucune mémoire. Elles seront capturées automatiquement lorsque vous discutez avec l\'agent.',
      noMatch: 'Aucune mémoire ne correspond au filtre.',
      delete: 'Supprimer',
      accessed: 'Accédé',
      times: 'x',
      preference: 'Préférence',
      habit: 'Habitude',
      fact: 'Fait',
      skill: 'Compétence',
      context: 'Contexte'
    },
    general: {
      workspacePath: 'Chemin du Workspace',
      browse: 'Parcourir',
      workspaceHint: 'Répertoire racine de travail de l\'agent. Les outils de fichiers sont relatifs à ce chemin.',
      language: 'Langue',
      languageHint: 'Langue de l\'interface. Détecte automatiquement la langue système au premier lancement.',
      autoDetect: 'Auto (Système)'
    }
  }
}
