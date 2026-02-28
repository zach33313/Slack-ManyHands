# Research & Architecture Documentation

This folder contains comprehensive research and architectural documentation for the Slack Clone project.

## Available Documentation

### [codebase_overview.md](./codebase_overview.md) ⭐ START HERE
**Comprehensive guide to the entire codebase** (719 lines)

Contents:
- **Project Summary** — What this is, key features
- **Technology Stack** — Complete dependency list with versions and purposes
  - Frontend: Next.js, React, Tailwind, Radix UI, Tiptap, Framer Motion, etc.
  - Backend: Node.js, Socket.IO, Prisma, node-cron, AWS S3, etc.
  - Testing: Jest, Testing Library, ESLint, Prettier
- **Architecture Overview** — Request flows, directory structure, domain-driven design
- **Database Schema** — 28 Prisma models with relationships
- **Key Architectural Patterns**
  - Server Actions (Next.js mutations)
  - Socket.IO real-time events
  - Authentication (NextAuth v5)
  - Type safety end-to-end
  - Scheduled messages delivery
  - Notification system
  - File uploads to S3
  - Atomic operations & race condition prevention
- **Development Workflow** — Setup, dev server, testing, build & deploy
- **Performance Optimizations** — Frontend, backend, storage
- **Common Code Patterns** — Real examples you can copy/paste
- **Troubleshooting Guide** — Quick problem solving

## Quick Reference

### Tech Stack at a Glance

| Layer | Framework | Version |
|-------|-----------|---------|
| **Frontend** | Next.js | 14.2.0 |
| **UI Framework** | React | 18.3.0 |
| **Styling** | Tailwind CSS | 3.4.0 |
| **Real-time** | Socket.IO | 4.7.5 |
| **Database ORM** | Prisma | 5.14.0 |
| **Auth** | NextAuth | 5.0.0-beta.25 |
| **Rich Text** | Tiptap | 3.0.0 |
| **Testing** | Jest | 30.2.0 |

### Directory Structure

```
slack-clone/
├── app/              # Next.js App Router (all routes)
├── server/           # Node.js-only code (Socket.IO, auth, cron)
├── prisma/           # Database schema & migrations
├── shared/           # Shared types & utilities
├── [domain]/         # Feature folders (messages, channels, etc.)
├── components/       # Shared UI components
├── auth/             # Authentication (NextAuth)
└── __tests__/        # Jest tests (mirrors structure)
```

### Common Tasks

**Setup**: See [Development Workflow](./codebase_overview.md#6-development-workflow)

**Add a feature**: 
1. Create folder `[feature]/`
2. Add Server Actions in `actions.ts`
3. Add Socket handlers in `server/socket-handlers/[feature].ts`
4. Create React components in `components/`
5. Add types in `types.ts`

**Debug issues**: See [Troubleshooting Guide](./codebase_overview.md#9-troubleshooting-guide)

**Understand a pattern**: 
- Server Actions → See [Server Actions Pattern](./codebase_overview.md#51-server-actions-nextjs-14)
- Real-time events → See [Socket.IO Pattern](./codebase_overview.md#52-socketio-real-time-architecture)
- Scheduled delivery → See [Scheduled Messages](./codebase_overview.md#58-scheduled-messages-yjs--tiptap)

## Key Files to Know

| File | Purpose |
|------|---------|
| `server.ts` | HTTP + Socket.IO entry point |
| `prisma/schema.prisma` | Database source of truth |
| `shared/types/index.ts` | All type definitions |
| `server/socket-handlers/messages.ts` | Message event handlers |
| `messages/actions.ts` | Message Server Actions |
| `auth/auth.config.ts` | NextAuth configuration |
| `server/cron/scheduled-messages.ts` | Scheduled message delivery |

## Database at a Glance

**28 Models** organized by feature:
- **Auth**: User, Account, Session, VerificationToken
- **Workspace**: Workspace, WorkspaceMember, ChannelCategory, CustomEmoji
- **Messaging**: Channel, ChannelMember, Message, Reaction, Pin, Bookmark
- **Advanced**: ScheduledMessage, Poll, PollVote, LinkPreview, FileAttachment
- **Collaboration**: Canvas, CanvasVersion, Call, CallParticipant
- **Features**: Notification, Workflow, WorkflowAction, WorkflowExecution, AuditLog

See [Database Schema](./codebase_overview.md#4-database-schema-28-models) for full details.

## Development Commands

```bash
# Setup
pnpm install
cp .env.example .env
npx prisma db push

# Development
npm run dev              # Next.js + Socket.IO + watch
npx tsc --noEmit       # Type check
npm test               # Jest tests

# Build & Deploy
npm run build          # Next.js + tsup server bundling
npm start              # Production server
```

See [Development Workflow](./codebase_overview.md#6-development-workflow) for complete guide.

## Implementation Guidelines

1. **Domain-Driven Design**: Organize code by feature, not file type
2. **Type Safety**: Use TypeScript strict mode, Zod validation, Prisma types
3. **Real-time First**: Use Socket.IO for updates, Server Actions for mutations
4. **Atomic Operations**: Use `prisma.$transaction()` for race conditions
5. **Error Isolation**: Wrap handlers in try/catch (especially in cron + socket)
6. **Testing**: Mirror directory structure in `__tests__/`, use Jest mocks

## References

- [Next.js 14 Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [Socket.IO Docs](https://socket.io/docs)
- [NextAuth v5](https://authjs.dev)
- [Tiptap Editor](https://tiptap.dev)

---

**Document Version**: 1.0
**Last Updated**: February 28, 2026
