import { config } from './config.js';
import { log } from './log.js';
import { getAIStatus } from './ai/index.js';
import { createApp } from './app.js';

const server = createApp();

server.listen(config.port, config.host, () => {
  const ai = getAIStatus();
  log.info(`Luna is running at http://${config.host}:${config.port}`);
  log.info(ai.configured ? `AI: ${ai.provider} / ${ai.model}` : `AI not configured: ${ai.problem}`);
  log.info(config.notion.token ? 'Notion: token present' : 'Notion: not configured');
});

// Ctrl+C or a process manager stop: let in-flight requests (like an autosave)
// finish before exiting, but don't hang forever.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    log.info('Shutting down…');
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
