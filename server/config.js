// Reads environment configuration once at startup. Secrets stay in this
// module and the providers that need them; only booleans/labels leave the server.

const env = (name) => (process.env[name] ?? '').trim();

export const AI_PROVIDERS = ['anthropic', 'openai', 'ollama'];

export const config = {
  port: Number(env('PORT')) || 3000,
  host: env('HOST') || '127.0.0.1',
  ai: {
    provider: env('AI_PROVIDER').toLowerCase(),
    model: env('AI_MODEL'),
    anthropicKey: env('ANTHROPIC_API_KEY'),
    openaiKey: env('OPENAI_API_KEY'),
    ollamaUrl: (env('OLLAMA_URL') || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
  },
  notion: {
    token: env('NOTION_TOKEN'),
    databaseId: env('NOTION_DATABASE_ID'),
  },
};
