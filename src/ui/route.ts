export interface Route {
  path: string;
  params: URLSearchParams;
}

/** Reads "#/watch" or "#/?seed=abc" from the address bar. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const q = raw.indexOf("?");
  const path = (q >= 0 ? raw.slice(0, q) : raw) || "/";
  return { path, params: new URLSearchParams(q >= 0 ? raw.slice(q + 1) : "") };
}
