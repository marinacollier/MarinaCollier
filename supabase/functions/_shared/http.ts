/** CORS + JSON helpers. Only the app origin (APP_ORIGIN secret) may call the functions from a browser. */

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = Deno.env.get('APP_ORIGIN') ?? ''
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': origin && origin === allowed ? origin : allowed,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response(null, { status: 204, headers: corsHeaders(req) }) : null
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export type ErrorCode = 'unauthorized' | 'needs_auth' | 'policy_blocked' | 'bad_request' | 'upstream' | 'not_configured'

export function fail(req: Request, error: ErrorCode, message: string, status = 400): Response {
  return json(req, { error, message }, status)
}

export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/** Wrap a handler: preflight, HttpError → JSON error, anything else → 500 without leaking details. */
export function serve(handler: (req: Request, url: URL) => Promise<Response>): void {
  Deno.serve(async (req) => {
    const pre = preflight(req)
    if (pre) return pre
    try {
      return await handler(req, new URL(req.url))
    } catch (err) {
      if (err instanceof HttpError) return fail(req, err.code, err.message, err.status)
      console.error(err)
      return fail(req, 'upstream', 'Erro inesperado no servidor', 500)
    }
  })
}

export function requiredEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new HttpError('not_configured', `Segredo ${name} não configurado`, 500)
  return v
}
