// Errors that carry an HTTP status and a message that's safe to show the user.
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what = 'That') => new HttpError(404, `${what} wasn’t found.`, 'not_found');
export const badRequest = (message) => new HttpError(400, message, 'bad_request');
