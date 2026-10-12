// Minimal logger. By design it only ever records request metadata and error
// summaries — never request/response bodies, which may contain journal text.

const ts = () => new Date().toISOString();
// LUNA_QUIET=1 silences routine request lines (used by the tests). Errors still print.
const quiet = process.env.LUNA_QUIET === '1';

export const log = {
  request(method, path, status, ms) {
    if (quiet) return;
    console.log(`${ts()} ${method} ${path} ${status} ${ms}ms`);
  },
  info(msg) {
    if (quiet) return;
    console.log(`${ts()} ${msg}`);
  },
  error(msg, err) {
    // Only the error's name/message; providers are written so these never embed content.
    const detail = err ? ` (${err.name}: ${err.message})` : '';
    console.error(`${ts()} ERROR ${msg}${detail}`);
  },
};
