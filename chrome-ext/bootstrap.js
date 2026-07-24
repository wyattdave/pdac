// PDAC bootstrap — installs the window.fetch interceptor BEFORE app.js runs.
//
// The original PDAC front-end (app.js, copied verbatim from public/) talks to
// its Node server exclusively through fetch('/api/...') calls. This module is
// loaded as the module script immediately before app.js in app.html, so its
// top-level code patches window.fetch first (module execution order is
// guaranteed). API requests are routed to src/server-core.js — the browser
// port of server.mjs — through Node-style fake req/res objects; everything
// else passes through to the real fetch.

const nativeFetch = window.fetch.bind(window);
let serverCorePromise = null;

function loadServerCore() {
  if (!serverCorePromise) {
    serverCorePromise = import('./src/server-core.js');
  }
  return serverCorePromise;
}

function requestPath(input) {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return `${input.pathname}${input.search}`;
  }
  if (input instanceof Request) {
    try {
      const url = new URL(input.url);
      return `${url.pathname}${url.search}`;
    } catch {
      return String(input.url || '');
    }
  }
  return String(input || '');
}

function lowercaseHeaders(headers) {
  const result = {};
  if (!headers) {
    return result;
  }
  if (headers instanceof Headers) {
    for (const [name, value] of headers.entries()) {
      result[name.toLowerCase()] = value;
    }
    return result;
  }
  if (Array.isArray(headers)) {
    for (const [name, value] of headers) {
      result[String(name).toLowerCase()] = String(value);
    }
    return result;
  }
  for (const [name, value] of Object.entries(headers)) {
    result[String(name).toLowerCase()] = String(value);
  }
  return result;
}

async function readRequestBody(input, init) {
  if (init && init.body !== undefined && init.body !== null) {
    if (typeof init.body === 'string') {
      return init.body;
    }
    if (init.body instanceof Blob) {
      return init.body.text();
    }
    if (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body)) {
      return new TextDecoder().decode(init.body);
    }
    return String(init.body);
  }
  if (input instanceof Request && input.method !== 'GET' && input.method !== 'HEAD') {
    try {
      return await input.clone().text();
    } catch {
      return '';
    }
  }
  return '';
}

async function handleLocalApi(input, init = {}) {
  const { handleApiRequest } = await loadServerCore();

  const method = String(
    init.method || (input instanceof Request ? input.method : 'GET') || 'GET',
  ).toUpperCase();
  const headers = {
    ...(input instanceof Request ? lowercaseHeaders(input.headers) : {}),
    ...lowercaseHeaders(init.headers),
  };
  headers.host = headers.host || 'pdac.extension';

  const req = {
    url: requestPath(input),
    method,
    headers,
    body: await readRequestBody(input, init),
  };

  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(status, resHeaders = {}) {
        this.statusCode = status;
        Object.assign(this.headers, resHeaders);
      },
      end(body) {
        try {
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(this.headers)) {
            // Content-Length is recomputed by the Response body itself.
            if (String(name).toLowerCase() === 'content-length') {
              continue;
            }
            responseHeaders.set(name, String(value));
          }
          const responseBody = body === undefined || body === null
            ? null
            : typeof body === 'string'
              ? body
              : ArrayBuffer.isView(body)
                ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
                : body;
          resolve(new Response(responseBody, {
            status: this.statusCode,
            headers: responseHeaders,
          }));
        } catch (error) {
          reject(error);
        }
      },
    };

    handleApiRequest(req, res).catch(reject);
  });
}

window.fetch = (input, init) => {
  const path = requestPath(input);
  if (path.startsWith('/api/')) {
    return handleLocalApi(input, init);
  }
  return nativeFetch(input, init);
};
