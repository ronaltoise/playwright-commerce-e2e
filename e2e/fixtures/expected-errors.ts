// What the console guard is allowed to ignore. Keep this list short: each entry is a kind of error
// that no test will ever notice again.

/** The browser logs every refused request, and refusing bad input is normal behaviour for this shop. */
const REFUSED_REQUEST = /Failed to load resource: the server responded with a status of 4\d\d/;

export const isExpectedError = (message: string): boolean => REFUSED_REQUEST.test(message);
