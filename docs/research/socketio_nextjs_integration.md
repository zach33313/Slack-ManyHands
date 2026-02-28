# Socket.IO Integration with Next.js 14 App Router

**Research Date**: February 2026
**Context**: Stock anomaly detection dashboard — needs real-time push of anomaly alerts to browser clients

---

## RECOMMENDATION

**Use the Custom Server approach (`server.ts`) with Socket.IO 4.x**

Specifically: create a `server.ts` at the project root that boots Next.js's request handler inside a plain `http.Server`, then attach `socket.io` to that same server — all on port 3000.

**Why this over the alternatives:**
- Single port, no CORS configuration needed
- Session cookies (NextAuth v5) are automatically available on the Socket.IO handshake request because they share the same origin and same HTTP server
- Works fully with App Router and RSCs (sockets are client-side; RSCs are unaffected)
- Straightforward to deploy on Railway / Fly.io / Render / any VPS
- The instrumentation hook alternative looks cleaner on paper but is still experimental and has documented issues with dev-mode double-invocation
- Separate-port Express server introduces mandatory cross-origin CORS + cookie SameSite complexity that is hard to get right with NextAuth v5's secure-only cookies

**Reject Vercel** — it does not support persistent WebSocket connections. Use Railway, Fly.io, Render, or self-hosted (Docker/VPS).

---

## INSTALLATION

```bash
# In your Next.js frontend package
npm install socket.io socket.io-client

# TypeScript support (usually bundled with socket.io)
npm install --save-dev tsx tsup
```

`package.json` scripts:
```json
{
  "scripts": {
    "dev": "tsx watch server.ts",
    "build": "next build && tsup server.ts --format cjs --out-dir dist/server",
    "start": "NODE_ENV=production node dist/server/server.js"
  }
}
```

`tsconfig.server.json` (separate config to avoid Next.js module resolution conflicts):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist/server",
    "esModuleInterop": true,
    "strict": true
  },
  "include": ["server.ts", "server/**/*.ts"]
}
```

---

## USAGE EXAMPLE

### 1. `server.ts` (project root)

```typescript
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import type { NextApiRequest } from "next";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    // Same origin — no CORS needed for same-port setup
    cors: dev
      ? { origin: "http://localhost:3000", credentials: true }
      : { origin: process.env.NEXT_PUBLIC_APP_URL, credentials: true },
    // Longer timeouts for stock market hours (5-min inactivity ok)
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Attach to global so API routes can emit events
  (global as any).__socketio = io;

  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // Client subscribes to a ticker's anomaly feed
    socket.on("subscribe", (ticker: string) => {
      socket.join(`ticker:${ticker.toUpperCase()}`);
    });

    socket.on("unsubscribe", (ticker: string) => {
      socket.leave(`ticker:${ticker.toUpperCase()}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[socket] disconnected: ${socket.id} — ${reason}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(
      `> Ready on http://localhost:${port} (${dev ? "dev" : "production"})`
    );
  });
});
```

### 2. `server/socket-emitter.ts` — emit from anywhere in the server

```typescript
import type { Server as SocketIOServer } from "socket.io";

/** Retrieve the Socket.IO instance attached to the global HTTP server */
export function getIO(): SocketIOServer {
  const io = (global as any).__socketio;
  if (!io) throw new Error("Socket.IO server not initialized");
  return io;
}

/** Push a new anomaly alert to all subscribers of a ticker */
export function emitAnomalyAlert(ticker: string, alert: object) {
  try {
    const io = getIO();
    io.to(`ticker:${ticker.toUpperCase()}`).emit("anomaly:alert", alert);
  } catch (err) {
    console.error("[socket] emitAnomalyAlert failed:", err);
  }
}
```

### 3. Calling the emitter from a Next.js Route Handler (App Router)

```typescript
// app/api/scanner/trigger/route.ts
import { NextResponse } from "next/server";
import { emitAnomalyAlert } from "@/server/socket-emitter";

export async function POST(req: Request) {
  const { ticker, alert } = await req.json();
  emitAnomalyAlert(ticker, alert);
  return NextResponse.json({ ok: true });
}
```

### 4. `lib/socket.ts` — singleton client (App Router / "use client")

```typescript
"use client";
import { io, Socket } from "socket.io-client";

let socket: Socket | undefined;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      // Same origin — no host/port needed
      path: "/socket.io",
      // Start with polling, upgrade to WebSocket automatically
      transports: ["polling", "websocket"],
      withCredentials: true, // sends NextAuth cookies
    });
  }
  return socket;
}
```

### 5. `components/AnomalyFeed.tsx` — React component using socket

```typescript
"use client";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

interface AnomalyAlert {
  ticker: string;
  severity: string;
  score: number;
  detectedAt: string;
}

export function AnomalyFeed({ ticker }: { ticker: string }) {
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("subscribe", ticker);

    socket.on("anomaly:alert", (alert: AnomalyAlert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 50));
    });

    return () => {
      socket.off("anomaly:alert");
      socket.emit("unsubscribe", ticker);
    };
  }, [ticker]);

  return (
    <ul>
      {alerts.map((a, i) => (
        <li key={i}>
          {a.ticker} — {a.severity} ({a.score.toFixed(2)}) at {a.detectedAt}
        </li>
      ))}
    </ul>
  );
}
```

---

## INTEGRATION NOTES

### App Router & RSC Compatibility

- Server Components run on the server — they never import or use `socket.io-client`
- Socket connections are established only inside `"use client"` components via `useEffect`
- Route Handlers (app/api/\*\*/route.ts) run inside the same Node.js process as `server.ts`, so `getIO()` / `emitAnomalyAlert()` work without any inter-process communication

### NextAuth v5 Session Sharing

Because the Socket.IO server runs on the **same HTTP server and same origin** as Next.js, the browser's session cookies (set by NextAuth on `/api/auth`) are sent automatically on every Socket.IO HTTP handshake request.

Read the session inside a Socket.IO middleware:

```typescript
// server/socket-auth.ts
import { getToken } from "next-auth/jwt";
import type { IncomingMessage } from "http";
import type { Server as SocketIOServer } from "socket.io";

export function applyAuthMiddleware(io: SocketIOServer) {
  io.use(async (socket, next) => {
    try {
      // socket.request is the raw HTTP upgrade/polling IncomingMessage
      const token = await getToken({
        req: socket.request as IncomingMessage & { cookies: Record<string, string> },
        secret: process.env.NEXTAUTH_SECRET!,
        // NextAuth v5 default cookie name (adjust if customized)
        cookieName:
          process.env.NODE_ENV === "production"
            ? "__Secure-authjs.session-token"
            : "authjs.session-token",
      });

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      // Attach user info to the socket for downstream handlers
      (socket as any).userId = token.sub;
      (socket as any).userEmail = token.email;
      next();
    } catch (err) {
      next(new Error("Auth error"));
    }
  });
}
```

Then call `applyAuthMiddleware(io)` in `server.ts` before `io.on("connection", ...)`.

**Cookie name note (NextAuth v5 / Auth.js):**
- Development: `authjs.session-token`
- Production (HTTPS): `__Secure-authjs.session-token`
- The cookie is an encrypted JWE; `getToken()` decrypts it using `NEXTAUTH_SECRET`

### Dev Hot-Reload Behavior

This is the **main pain point** of the custom server approach:

- Next.js HMR (hot module replacement for React components) **still works** — the Next.js `app` instance handles its own HMR internally
- However, changes to `server.ts` itself require **a full process restart** — `tsx watch server.ts` handles this automatically
- Changes to `server/` files (socket handlers, emitters) also require a restart with `tsx watch`
- **Workaround**: keep `server.ts` thin (just wiring); put socket business logic in `server/` modules and live with the restart on socket-logic changes

### Deployment Configuration

**Railway** (recommended for this project):

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server/server.js"]
```

Railway auto-detects `EXPOSE 3000` and routes traffic through its proxy which **does support WebSockets**.

**Environment variables needed:**
```
NEXTAUTH_SECRET=<random-32-byte-hex>
NEXTAUTH_URL=https://your-app.up.railway.app
NEXT_PUBLIC_SOCKET_URL=https://your-app.up.railway.app
```

**Fly.io:** Add `[[services.ports]]` with `handlers = ["tls", "http"]` and ensure `[[services]]` has `internal_port = 3000`. Fly.io fully supports WebSockets.

---

## ALTERNATIVES CONSIDERED

### Option 2: Separate Express Server on a Different Port

**How it works:** Run a standalone `express` + `socket.io` server on port 3001; the Next.js app on port 3000.

**Pros:**
- Independent deployability (could run socket server separately)
- No monkey-patching of Next.js's request handler

**Cons:**
- **CORS complexity**: Must configure `cors` in socket.io + `Access-Control-Allow-Origin` headers
- **Session sharing broken by default**: NextAuth v5 session cookies are `SameSite=Lax` and `Secure` in production — they are NOT sent cross-origin. You must pass a JWT manually in `socket.io` auth handshake headers, adding round-trips and complexity
- Requires managing two processes in development and production
- Two ports in the deployment proxy config

**Pattern if used:**
```typescript
// Client must pass token manually
const socket = io("http://localhost:3001", {
  auth: { token: session?.accessToken },
  withCredentials: true,
});

// Server validates token
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  // verify JWT...
});
```

**Verdict:** More work, more attack surface, harder HTTPS/cookie setup. Avoid unless the socket server truly needs to be a separate microservice.

---

### Option 3: Next.js `instrumentation.ts` Hook

**How it works:** Export `register()` from `instrumentation.ts`; inside it, create a separate `http.Server` on a different port and attach Socket.IO.

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { createServer } = await import("http");
    const { Server } = await import("socket.io");
    const httpServer = createServer();
    const io = new Server(httpServer, {
      cors: { origin: process.env.NEXT_PUBLIC_APP_URL, credentials: true },
    });
    httpServer.listen(3001);
    (global as any).__socketio = io;
  }
}
```

**Pros:**
- No custom server; keeps `next dev` and `next start` scripts
- Potentially cleaner local dev (Turbopack still works)
- `instrumentationHook` is stable as of Next.js 14.1+

**Cons:**
- `register()` is called **twice in development** (once for Edge, once for Node.js) — must guard with `process.env.NEXT_RUNTIME === "nodejs"` check or face double server startup
- Opens a **second port** (same CORS/cookie issues as Option 2 above)
- Still can't share the main port without access to the internal `http.Server`, which Next.js does not expose via instrumentation
- Documented community issues with Socket.IO on this approach (see [GitHub Discussion #50097](https://github.com/vercel/next.js/discussions/50097))

**Verdict:** Avoids custom server startup script but introduces second-port CORS problem. Not recommended when NextAuth session sharing is required.

---

### Option 4: API Route with WebSocket Upgrade

**How it works:** Socket.IO / raw WebSocket inside a `route.ts` file (App Router).

```typescript
// app/api/socket/route.ts — does NOT work with Socket.IO
export async function GET(req: Request) {
  // Next.js Route Handlers do not support HTTP Upgrade
  // socket.io requires Upgrade: websocket at the HTTP layer
}
```

**Cons:**
- Next.js App Router Route Handlers **do not support HTTP Upgrade requests** as of Next.js 14/15 (tracked in [Discussion #58698](https://github.com/vercel/next.js/discussions/58698))
- `next-ws` library patches Next.js internals to enable raw `ws` WebSockets in routes, but it does not work with Socket.IO's protocol
- Only viable for raw `ws` WebSocket connections (not Socket.IO with its polling transport, reconnection, namespaces, etc.)

**Verdict:** Not viable for Socket.IO. Use `next-ws` only if you want raw WebSockets without Socket.IO features.

---

### Option 5: `next-ws` Library (raw WebSockets only)

- GitHub: https://github.com/apteryxxyz/next-ws
- Stars: 316 | Latest: v2.1.16 (Jan 2026)
- Patches Next.js to support `UPGRADE` exports in route files
- Works for raw `ws` WebSockets but **not Socket.IO**
- Requires `next-ws patch` step post-install
- Not recommended for this project which benefits from Socket.IO's room management and auto-reconnection

---

## Summary Decision Matrix

| Criterion | Custom Server (✅ Recommended) | Separate Port | Instrumentation Hook | API Route |
|---|---|---|---|---|
| App Router / RSC compatible | ✅ | ✅ | ✅ | ❌ |
| Dev hot-reload (HMR) | Partial (server restart on server.ts change) | ✅ | Partial | N/A |
| CORS complexity | None (same port) | High | High | N/A |
| NextAuth v5 session sharing | ✅ Easy (same origin) | Complex (manual JWT) | Complex (manual JWT) | N/A |
| Deployment simplicity | Single service | Two services | Single service | N/A |
| Vercel deployable | ❌ | ❌ | ❌ | ❌ |
| Stable / production tested | ✅ | ✅ | Partial (experimental) | ❌ |
| Socket.IO feature support | Full | Full | Full | ❌ |

---

## Sources

- [Socket.IO official Next.js guide](https://socket.io/how-to/use-with-nextjs)
- [Integrating Socket.IO with the App Router — Next.js Discussion #50097](https://github.com/vercel/next.js/discussions/50097)
- [Enable WebSocket upgrade in route handlers — Next.js Discussion #58698](https://github.com/vercel/next.js/discussions/58698)
- [Socket.IO with Next.js App Router (kamleshpaul.com)](https://kamleshpaul.com/posts/how-to-use-websocket-in-nextjs-app-router-with-socketio)
- [Socket.IO JWT authentication guide](https://socket.io/how-to/use-with-jwt)
- [Socket.IO Middlewares docs](https://socket.io/docs/v4/middlewares/)
- [Auth.js (NextAuth v5) migration guide](https://authjs.dev/guides/upgrade-to-v5)
- [next-ws GitHub](https://github.com/apteryxxyz/next-ws)
- [Using WebSockets with Next.js on Fly.io](https://fly.io/javascript-journal/websockets-with-nextjs/)
- [Next.js instrumentation docs](https://nextjs.org/docs/app/guides/instrumentation)
- [Hot reload not working with Next.js custom server — Issue #52931](https://github.com/vercel/next.js/issues/52931)
