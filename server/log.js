// Minimal logger. By design it only ever records request metadata and error
// summaries — never request/response bodies, which may contain journal text.

const ts = () => new Date().toISOString();

export const log = {
  request(method, path, status, ms) {
    console.log(`${ts()} ${method} ${path} ${status} ${ms}ms`);
  },
  info(msg) {
    console.log(`${ts()} ${msg}`);
  },
  error(msg, err) {
    // Only the error's name/message; providers are written so these never embed content.
    const detail = err ? ` (${err.name}: ${err.message})` : '';
    console.error(`${ts()} ERROR ${msg}${detail}`);
  },
};
