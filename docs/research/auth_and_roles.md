# Authentication & Workspace Roles System Analysis

**Project**: Slack Clone
**Framework**: Next.js 14 with NextAuth v5 (beta)
**Session Strategy**: JWT (required for Socket.IO integration)
**Database**: Prisma ORM (SQLite for dev, PostgreSQL for prod)
**Date**: February 2026
**Status**: Production architecture analysis

---

## Executive Summary

The authentication system uses **NextAuth v5 with JWT session strategy** to enable secure session sharing between Next.js routes, Server Actions, API routes, and Socket.IO WebSocket connections. Workspace roles (OWNER/ADMIN/MEMBER) are stored in the `WorkspaceMember` table with a permission hierarchy enforced by the `hasPermission()` helper function. The system is designed for **admin dashboard features** including member management, role changes, audit logging, and feature-specific permissions.

**Key characteristics**:
- ✅ JWT-based sessions (all requests carry cookies)
- ✅ NextAuth + PrismaAdapter for OAuth account linking
- ✅ Role-based access control (RBAC) with hierarchy enforcement
- ✅ Consistent permission checking across API routes, Server Actions, and handlers
- ✅ Middleware-based auth validation
- ✅ Socket.IO integration via session cookies

---

## 1. NextAuth Configuration & Session Strategy

### Configuration File

**File**: `auth/auth.config.ts`

```typescript
export const authConfig: NextAuthConfig = {
  providers: [
    // Credentials provider: email/password login
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // Fetch user by email, bcrypt password match
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user || !user.password) return null;
        const match = compareSync(credentials.password, user.password);
        if (!match) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
    // Google OAuth (optional, env-gated)
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
      : []),
  ],

  session: {
    strategy: 'jwt', // JWT required for Socket.IO cookie sharing
  },

  pages: {
    signIn: '/login',
    newUser: '/register',
  },

  callbacks: {
    // Attach userId to JWT on sign-in
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },

    // Expose userId and role to client session
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      if (token.role) {
        session.user.role = token.role;
      }
      return session;
    },
  },
};
```

### Main Auth Module

**File**: `auth/auth.ts`

```typescript
export const {
  handlers,     // For app/api/auth/[...nextauth]/route.ts
  auth,         // Get current session
  signIn,       // Client-side sign-in action
  signOut,      // Client-side sign-out action
} = NextAuth({
  adapter: PrismaAdapter(prisma),  // OAuth account linking
  secret: process.env.AUTH_SECRET,
  ...authConfig,
});
```

### Session Strategy: JWT vs Database

| Aspect | JWT Strategy | Database Sessions |
|--------|--------------|-------------------|
| **Cookie name** | `authjs.session-token` (dev) / `__Secure-authjs.session-token` (prod) | `sessionToken` |
| **Storage** | Encrypted in cookie only | Cookie + database |
| **Socket.IO compatible** | ✅ Yes (cookies auto-sent) | ❌ Requires manual token passing |
| **Scalability** | ✅ Stateless, no server lookup | ⚠️ Requires session DB queries |
| **Security** | ✅ Encrypted, signed | ✅ Revocable |

**Why JWT for this project**: Socket.IO requires session cookies to be sent automatically on WebSocket upgrade requests. JWT enables this without manual token passing.

---

## 2. Auth Helpers & Middleware

### Session Access Functions

**File**: `auth/middleware.ts`

```typescript
/**
 * Get the current auth session (nullable).
 * Safe for Server Components, Route Handlers, and Server Actions.
 */
export async function getAuthSession() {
  return auth();
}

/**
 * Require authentication (throws on missing session).
 * Use in API routes and protected Server Actions.
 * @throws AuthError with status 401 if not authenticated
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError('Unauthorized');
  }
  return session;
}

export class AuthError extends Error {
  public readonly status: number;
  constructor(message = 'Unauthorized', status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
```

### Session Type Augmentation

**File**: `auth/types.ts`

Module augmentations add type-safe `id` and `role` to the NextAuth session:

```typescript
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;        // Authenticated user's ID
      role?: string;     // Optional global role (not workspace-scoped)
    } & DefaultSession['user'];
  }

  interface User {
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    role?: string;
  }
}
```

### Usage Patterns

**In Server Components**:
```typescript
import { getAuthSession } from '@/auth/middleware';

export default async function Dashboard() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect('/login');
  }
  return <div>Welcome {session.user.name}</div>;
}
```

**In API Routes**:
```typescript
import { requireAuth, AuthError } from '@/auth/middleware';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;
    // ... protected logic
    return NextResponse.json(ok(data));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(err('UNAUTHORIZED', error.message), { status: error.status });
    }
    return NextResponse.json(err('INTERNAL_ERROR', '...'), { status: 500 });
  }
}
```

**In Server Actions**:
```typescript
'use server';

import { requireAuth } from '@/auth/middleware';

export async function myAction() {
  const session = await requireAuth();
  const userId = session.user.id;
  // ... protected logic
}
```

---

## 3. Workspace Roles & Permission Hierarchy

### Role Definitions

**File**: `shared/types/index.ts`

```typescript
export enum MemberRole {
  OWNER = 'OWNER',   // Workspace creator, full control
  ADMIN = 'ADMIN',   // Can manage settings, members, channels
  MEMBER = 'MEMBER', // Can post messages, read channels
}
```

### Role Hierarchy & Permission Checking

**File**: `shared/lib/constants.ts`

```typescript
/** Roles ordered from least to most privileged */
export const ROLE_HIERARCHY: MemberRole[] = [
  MemberRole.MEMBER,
  MemberRole.ADMIN,
  MemberRole.OWNER,
];

/**
 * Check if a role has at least the required privilege.
 * @example
 *   hasPermission(MemberRole.ADMIN, MemberRole.ADMIN)    // true
 *   hasPermission(MemberRole.ADMIN, MemberRole.MEMBER)   // true (higher privilege)
 *   hasPermission(MemberRole.MEMBER, MemberRole.ADMIN)   // false (insufficient)
 */
export function hasPermission(role: MemberRole, requiredRole: MemberRole): boolean {
  return ROLE_HIERARCHY.indexOf(role) >= ROLE_HIERARCHY.indexOf(requiredRole);
}
```

### Database Schema

**File**: `prisma/schema.prisma`

```prisma
model WorkspaceMember {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String
  role        String   @default("MEMBER")  // Stored as String, typed as MemberRole
  joinedAt    DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
  @@index([workspaceId])
  @@index([userId])
  @@map("workspace_members")
}

model Workspace {
  id      String  @id @default(cuid())
  name    String
  slug    String  @unique
  iconUrl String?
  ownerId String  // Only the owner can delete the workspace

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  owner        User              @relation("WorkspaceOwner", fields: [ownerId], references: [id])
  members      WorkspaceMember[]
  channels     Channel[]
  customEmojis CustomEmoji[]

  @@map("workspaces")
}
```

### Role Responsibilities Matrix

| Feature | Member | Admin | Owner |
|---------|--------|-------|-------|
| **Read messages** | ✅ | ✅ | ✅ |
| **Send messages** | ✅ | ✅ | ✅ |
| **Create channels** | ❌ | ✅ | ✅ |
| **Archive channels** | ❌ | ✅ | ✅ |
| **Update workspace settings** | ❌ | ✅ | ✅ |
| **Invite members** | ❌ | ✅ | ✅ |
| **Change member roles** | ❌ | ❌ | ✅ |
| **Remove members** | ❌ | ✅ | ✅ |
| **Upload custom emoji** | ❌ | ✅ | ✅ |
| **Delete workspace** | ❌ | ❌ | ✅ |
| **View audit logs** | ❌ | ✅ | ✅ |

---

## 4. Workspace Management & Role Checking

### Server Actions with Permission Guards

**File**: `workspaces/actions.ts`

#### Create Workspace

```typescript
export async function createWorkspace(name: string, slug: string): Promise<Workspace> {
  const session = await requireAuth();  // Requires authentication
  const userId = session.user.id;

  // Transaction: create workspace + OWNER membership + default channels
  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name: name.trim(),
        slug: slugify(slug),
        ownerId: userId,  // Set as owner
      },
    });

    // Add creator as OWNER
    await tx.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId,
        role: MemberRole.OWNER,  // Always owner of created workspace
      },
    });

    // Create default channels (#general, #random)
    for (const channelName of DEFAULT_CHANNELS) {
      const channel = await tx.channel.create({
        data: {
          workspaceId: ws.id,
          name: channelName,
          type: ChannelType.PUBLIC,
          createdById: userId,
        },
      });
      await tx.channelMember.create({
        data: { channelId: channel.id, userId },
      });
    }

    return ws;
  });

  revalidatePath('/');
  return workspace;
}
```

#### Update Workspace (ADMIN+ Required)

```typescript
export async function updateWorkspace(
  id: string,
  data: UpdateWorkspaceInput
): Promise<Workspace> {
  const session = await requireAuth();
  const userId = session.user.id;

  // Check membership
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId } },
    select: { role: true },
  });

  if (!member) {
    throw new Error('You are not a member of this workspace');
  }

  // Check ADMIN+ permission
  if (!hasPermission(member.role as MemberRole, MemberRole.ADMIN)) {
    throw new Error('Only workspace owners and admins can update workspace settings');
  }

  // ... update workspace
}
```

#### Change Member Role (OWNER Only)

**File**: `members/actions.ts`

```typescript
export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: MemberRole
): Promise<WorkspaceMember> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized: You must be signed in');
  }

  const currentUserId = session.user.id;

  // Verify current user is OWNER (not admin)
  const currentMember = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId: currentUserId },
    },
    select: { role: true },
  });

  // ⚠️ IMPORTANT: Role changes require OWNER (not ADMIN)
  if (!currentMember || currentMember.role !== MemberRole.OWNER) {
    throw new Error('Forbidden: Only workspace owners can change member roles');
  }

  // Cannot change own role
  if (userId === currentUserId) {
    throw new Error('Cannot change your own role');
  }

  // Cannot assign OWNER role via this function
  if (role === MemberRole.OWNER) {
    throw new Error('Cannot assign OWNER role via updateMemberRole');
  }

  const updated = await prisma.workspaceMember.update({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
    data: { role },
  });

  return updated;
}
```

---

## 5. API Route Authorization Pattern

### Standard Authorization Flow

**File**: `app/api/workspaces/[workspaceId]/route.ts`

```typescript
/**
 * PATCH /api/workspaces/:workspaceId
 * Update workspace settings (ADMIN+ required)
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await requireAuth();  // Throws 401 if not authenticated
    const { workspaceId } = await params;

    // Step 1: Check membership
    const role = await getMemberRole(workspaceId, session.user.id);
    if (!role) {
      return NextResponse.json(
        err('FORBIDDEN', 'You are not a member of this workspace'),
        { status: 403 }
      );
    }

    // Step 2: Check permission (ADMIN+)
    if (!hasPermission(role, MemberRole.ADMIN)) {
      return NextResponse.json(
        err('FORBIDDEN', 'Only admins and owners can update workspace settings'),
        { status: 403 }
      );
    }

    // Step 3: Validate input
    const body = await request.json();
    const parsed = updateWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'Invalid input', fieldErrors),
        { status: 400 }
      );
    }

    // Step 4: Mutate
    const workspace = await updateWorkspace(workspaceId, parsed.data);

    // Step 5: Return success
    return NextResponse.json(ok(workspace));

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(err('UNAUTHORIZED', error.message), { status: error.status });
    }
    return NextResponse.json(err('INTERNAL_ERROR', 'Failed'), { status: 500 });
  }
}
```

### Permission Checking Pattern

```typescript
// Pattern: Membership check → Permission check → Mutation

// 1. Check membership (is user in workspace?)
const role = await getMemberRole(workspaceId, userId);
if (!role) return 403; // Not a member

// 2. Check permission (does user's role allow this action?)
if (!hasPermission(role, MemberRole.ADMIN)) return 403; // Insufficient privilege

// 3. Proceed with mutation
await updateWorkspace(workspaceId, data);
```

---

## 6. Existing Admin Guards & Checks

### Member Management Permissions

**File**: `app/api/workspaces/[workspaceId]/members/route.ts`

```typescript
// GET /api/workspaces/:id/members
// ✅ Requires: Workspace membership (any role)

// POST /api/workspaces/:id/members (invite)
// ✅ Requires: ADMIN+ role

// DELETE /api/workspaces/:id/members?userId=
// ✅ Requires: ADMIN+ role
// ⚠️ Cannot remove owner
```

### Workspace Settings Permissions

```typescript
// PATCH /api/workspaces/:id (update name, slug, icon)
// ✅ Requires: ADMIN+ role

// DELETE /api/workspaces/:id
// ✅ Requires: OWNER role
```

### Implicit Guards

**Role change** (`updateMemberRole`):
- ✅ Requires: OWNER (strict, not ADMIN)
- ✅ Cannot change own role
- ✅ Cannot assign OWNER via this function

**Custom emoji upload** (`CustomEmoji.createdById`):
- ✅ Currently: No explicit guard in schema
- ⚠️ **TODO**: Add permission check before emoji creation

---

## 7. Admin Dashboard Feature Requirements

### Feature Access Control Matrix

| Feature | Required Role | Guard Location | Status |
|---------|---------------|-----------------|--------|
| **Member List** | MEMBER | Query-level (read-only) | ✅ Done |
| **Member Role Change** | OWNER | Action-level + API | ✅ Done |
| **Member Removal** | ADMIN+ | Action-level + API | ✅ Done |
| **Workspace Settings** | ADMIN+ | Action-level + API | ✅ Done |
| **Channel Management** | ADMIN+ | ⚠️ Not found |  |
| **Custom Emoji Upload** | ADMIN+ | ⚠️ Missing | TODO |
| **Audit Logging** | ADMIN+ | ⚠️ No audit trail | TODO |
| **Workflow Management** | ADMIN+ | ⚠️ Not implemented | TODO |
| **DND Status Storage** | MEMBER | ⚠️ Not in User model | TODO |
| **Ban/Kick Members** | ADMIN+ | ⚠️ Missing | TODO |

### Admin Dashboard Guard Pattern

```typescript
// Implement in dashboard layout/route

export default async function AdminDashboard({ params }) {
  const session = await requireAuth();
  const { workspaceId } = params;

  // Check ADMIN+ permission
  const role = await getMemberRole(workspaceId, session.user.id);
  if (!role || !hasPermission(role, MemberRole.ADMIN)) {
    return notFound(); // or redirect to access denied
  }

  return <DashboardContent workspaceId={workspaceId} role={role} />;
}
```

---

## 8. Session Management & Socket.IO Integration

### Cookie-Based Session Sharing

Because Socket.IO and Next.js share the same HTTP server and origin:

```typescript
// server.ts
const httpServer = createServer((req, res) => {
  handle(req, res, parsedUrl);  // Next.js handles HTTP requests
});

const io = new SocketIOServer(httpServer, {
  cors: undefined,  // Same origin — no CORS needed
  // Session cookies are sent automatically on WebSocket upgrade
});

// Socket.IO auth middleware validates the same JWT cookie
io.use(async (socket, next) => {
  const token = await getToken({
    req: socket.request,
    secret: process.env.AUTH_SECRET,
    cookieName: process.env.NODE_ENV === 'production'
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token',
  });

  if (!token?.sub) {
    return next(new Error('unauthorized'));
  }

  socket.data.userId = token.sub;
  socket.data.email = token.email;
  next();
});
```

### Session Cookie Names

| Environment | Cookie Name | Secure Flag |
|-------------|-------------|------------|
| Development (HTTP) | `authjs.session-token` | ❌ No |
| Production (HTTPS) | `__Secure-authjs.session-token` | ✅ Yes |

**Why the `__Secure-` prefix?**: HTTP cookies with this prefix are only sent over HTTPS (RFC 6265 convention). They're ignored in development.

---

## 9. User Profile & Extended Fields

### User Model

**File**: `prisma/schema.prisma`

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  password      String?   // For credentials provider
  name          String?
  image         String?
  emailVerified DateTime?

  // Extended profile fields (for admin dashboard)
  title         String?   // Job title
  statusText    String?   // Custom status message
  statusEmoji   String?   // Status emoji (⚠️ Not DND status)
  timezone      String?   // User's timezone

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  workspaceMemberships WorkspaceMember[]
  // ... other relations
}
```

### Profile Update Action

**File**: `members/actions.ts`

```typescript
export async function updateProfile(data: UpdateProfileInput): Promise<UserProfile> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const userId = session.user.id;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.displayName,
      statusText: data.statusText,
      statusEmoji: data.statusEmoji,
      timezone: data.timezone,
      title: data.title,
    },
  });

  return updated;
}
```

---

## 10. Recommended Admin Dashboard Implementation

### Layout Component with Permission Guard

```typescript
// app/(workspace)/[slug]/admin/layout.tsx
'use client';

import { useParams, useRouter, notFound } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getMemberRole } from '@/workspaces/queries';
import { hasPermission } from '@/shared/lib/constants';
import { MemberRole } from '@/shared/types';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.slug as string;
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const role = await getMemberRole(workspaceId, userId);
        if (!role || !hasPermission(role, MemberRole.ADMIN)) {
          notFound();
        }
        setIsAuthorized(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId, router]);

  if (loading) return <Spinner />;
  if (!isAuthorized) return notFound();

  return <AdminNav workspaceId={workspaceId}>{children}</AdminNav>;
}
```

### Admin Features to Implement

```typescript
// app/(workspace)/[slug]/admin/page.tsx

// 1. Member Management
// - List all members with roles
// - Change roles (OWNER only)
// - Remove members (ADMIN+)
// - Invite new members (ADMIN+)

// 2. Workspace Settings
// - Update name, slug, icon (ADMIN+)
// - Configure visibility (public/private)
// - Manage defaults

// 3. Channel Management
// - Archive channels (ADMIN+)
// - Delete channels (ADMIN+)
// - Configure default channels

// 4. Custom Emoji Management
// - Upload workspace emoji (ADMIN+)
// - Delete emoji (ADMIN+)
// - View usage stats

// 5. Audit Logs
// - List actions by member, type, date
// - Actions: member role change, member removed, workspace updated, etc.
// - Required permission: ADMIN+

// 6. Workflow Management
// - Create, edit, delete workflows
// - Configure triggers and actions
// - Required permission: ADMIN+
```

---

## 11. TODO: Required Admin Features

### 1. Audit Logging

**Required schema addition**:

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  workspaceId String
  actorId   String

  action    String   // "MEMBER_ROLE_CHANGED", "MEMBER_REMOVED", etc.
  targetId  String?  // Member/channel being acted upon
  changes   String?  // JSON of before/after values

  createdAt DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  actor     User      @relation(fields: [actorId], references: [id])

  @@index([workspaceId, createdAt(sort: Desc)])
  @@map("audit_logs")
}
```

**Implementation pattern**:

```typescript
// Log changes whenever role is updated
await prisma.$transaction(async (tx) => {
  // Update member role
  const updated = await tx.workspaceMember.update({...});

  // Log the audit event
  await tx.auditLog.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'MEMBER_ROLE_CHANGED',
      targetId: memberId,
      changes: JSON.stringify({
        before: { role: oldRole },
        after: { role: newRole },
      }),
    },
  });
});
```

### 2. Custom Emoji Upload Guard

**Add permission check**:

```typescript
// app/api/emojis/route.ts

export async function POST(request: NextRequest) {
  const session = await requireAuth();
  const { workspaceId } = await request.json();

  // Check ADMIN+ permission
  const role = await getMemberRole(workspaceId, session.user.id);
  if (!hasPermission(role, MemberRole.ADMIN)) {
    return NextResponse.json(
      err('FORBIDDEN', 'Only admins can upload custom emoji'),
      { status: 403 }
    );
  }

  // ... create custom emoji
}
```

### 3. DND Status Storage

**Add to User model**:

```prisma
model User {
  // ... existing fields

  // Do Not Disturb status
  dndUntil     DateTime?  // When DND ends (null = not active)
  dndStatus    String?    // "OFFLINE", "AVAILABLE", "AWAY", "DND"
}
```

**Broadcast via Socket.IO**:

```typescript
socket.on('presence:set-dnd', async ({ workspaceId, dndUntil, status }) => {
  // Update user.dndStatus and dndUntil
  await prisma.user.update({
    where: { id: userId },
    data: { dndStatus: status, dndUntil },
  });

  // Broadcast to workspace
  emitToWorkspace(workspaceId, 'presence:update', {
    userId,
    status: 'DND', // Override with DND
  });
});
```

### 4. Workflow Management

**Required schema addition**:

```prisma
model Workflow {
  id          String  @id @default(cuid())
  workspaceId String
  name        String
  description String?
  enabled     Boolean @default(true)

  // Trigger: message posted, user joined, scheduled, etc.
  triggerType String
  triggerData String? // JSON config

  // Actions: post message, notify, change role, etc.
  actions     WorkflowAction[]

  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  creator   User      @relation(fields: [createdById], references: [id])

  @@index([workspaceId])
  @@map("workflows")
}

model WorkflowAction {
  id         String @id @default(cuid())
  workflowId String
  sequence   Int

  actionType String // "POST_MESSAGE", "NOTIFY", "CHANGE_ROLE"
  config     String // JSON action-specific config

  workflow Workflow @relation(fields: [workflowId], references: [id])
}
```

---

## 12. Security Considerations

### ✅ Already Implemented

- JWT token validation on all authenticated requests
- Role-based access control (RBAC) with hierarchy
- Per-workspace membership checks
- Ownership validation for sensitive operations
- Secure password hashing (bcryptjs)
- HTTP-only session cookies (NextAuth default)
- CSRF protection (NextAuth built-in)

### ⚠️ To Consider

- **Rate limiting**: Prevent brute force on login (no built-in limit yet)
- **Audit logging**: Track all admin actions (not yet implemented)
- **Workspace deletion**: Orphans all channels/messages (consider soft-delete)
- **Member ban**: No "banned users" list, can re-invite immediately
- **Token expiration**: Default 30 days (configurable in NextAuth)
- **Session revocation**: No server-side session revocation (JWT-based)
- **Admin permission escalation**: Prevent admins from assigning OWNER role (already done ✅)

### Role Privilege Escalation Prevention

```typescript
// Cannot change own role
if (userId === currentUserId) {
  throw new Error('Cannot change your own role');
}

// Cannot assign OWNER (only OWNER can change roles)
if (role === MemberRole.OWNER) {
  throw new Error('Cannot assign OWNER role');
}

// Cannot demote OWNER (no function to do this)
// Ownership transfer would be separate, explicit operation
```

---

## 13. Quick Reference: Permission Checking

### All Patterns

**Pattern 1: Check membership**
```typescript
const role = await getMemberRole(workspaceId, userId);
if (!role) throw new Error('Not a member');
```

**Pattern 2: Check specific role**
```typescript
if (role !== MemberRole.OWNER) throw new Error('Owner only');
```

**Pattern 3: Check role hierarchy (ADMIN+)**
```typescript
if (!hasPermission(role, MemberRole.ADMIN)) throw new Error('Admin+ required');
```

**Pattern 4: Check role hierarchy (MEMBER+, i.e., any role)**
```typescript
if (!hasPermission(role, MemberRole.MEMBER)) throw new Error('Member+ required');
```

### Hierarchy Quick Check

```
MEMBER < ADMIN < OWNER

hasPermission(MEMBER, MEMBER)    // ✅ true
hasPermission(MEMBER, ADMIN)     // ❌ false
hasPermission(ADMIN, MEMBER)     // ✅ true (higher privilege)
hasPermission(ADMIN, ADMIN)      // ✅ true
hasPermission(OWNER, ADMIN)      // ✅ true (highest privilege)
```

---

## 14. Testing Auth & Roles

### Unit Test Example

```typescript
import { getMemberRole, hasPermission } from '@/shared/lib/constants';
import { prisma } from '@/shared/lib/prisma';

describe('Workspace Roles', () => {
  it('should allow OWNER to change member roles', async () => {
    const workspace = await createTestWorkspace('owner-id');
    const targetMember = await addMember(workspace.id, 'target-id', MemberRole.MEMBER);

    const result = await updateMemberRole(
      workspace.id,
      'target-id',
      MemberRole.ADMIN
    );

    expect(result.role).toBe(MemberRole.ADMIN);
  });

  it('should prevent ADMIN from changing roles', async () => {
    const workspace = await createTestWorkspace('owner-id');
    await addMember(workspace.id, 'admin-id', MemberRole.ADMIN);
    await addMember(workspace.id, 'target-id', MemberRole.MEMBER);

    await expect(
      updateMemberRole(workspace.id, 'target-id', MemberRole.ADMIN, 'admin-id')
    ).rejects.toThrow('Only workspace owners can change member roles');
  });

  it('should not allow role self-assignment', async () => {
    const workspace = await createTestWorkspace('owner-id');

    await expect(
      updateMemberRole(workspace.id, 'owner-id', MemberRole.ADMIN)
    ).rejects.toThrow('Cannot change your own role');
  });
});
```

---

## 15. Summary & Checklist

### Implementation Checklist for Admin Dashboard

- [ ] **Member Management**
  - [ ] List workspace members with roles
  - [ ] Change member roles (OWNER only)
  - [ ] Remove members (ADMIN+)
  - [ ] Invite new members (ADMIN+)

- [ ] **Workspace Settings**
  - [ ] Update workspace name, slug, icon (ADMIN+)
  - [ ] Display member count, channel count

- [ ] **Custom Emoji**
  - [ ] Add permission guard (ADMIN+ only)
  - [ ] Upload/delete custom emoji

- [ ] **Audit Logging**
  - [ ] Create `AuditLog` table
  - [ ] Log: role changes, member removals, settings updates
  - [ ] Display audit log to ADMIN+ users

- [ ] **Workflows** (future)
  - [ ] Create `Workflow` + `WorkflowAction` tables
  - [ ] Build workflow builder UI
  - [ ] Implement workflow execution engine

- [ ] **DND Status** (future)
  - [ ] Add `dndStatus` and `dndUntil` to User model
  - [ ] Implement Socket.IO broadcasting
  - [ ] Add UI toggle for DND

- [ ] **Security**
  - [ ] Add rate limiting to login endpoint
  - [ ] Implement session revocation (if needed)
  - [ ] Add IP-based access controls (optional)

### Key Files Reference

| File | Purpose |
|------|---------|
| `auth/auth.ts` | NextAuth configuration and exports |
| `auth/auth.config.ts` | Provider config (Credentials, Google) |
| `auth/middleware.ts` | `requireAuth()`, `getAuthSession()` |
| `auth/types.ts` | NextAuth type augmentations |
| `shared/types/index.ts` | `MemberRole` enum |
| `shared/lib/constants.ts` | `hasPermission()` hierarchy |
| `workspaces/actions.ts` | Workspace CRUD with guards |
| `workspaces/queries.ts` | `getMemberRole()`, member queries |
| `members/actions.ts` | `updateMemberRole()` (OWNER only) |
| `app/api/workspaces/[id]/route.ts` | Workspace API endpoints |
| `app/api/workspaces/[id]/members/route.ts` | Members API endpoints |

---

## Appendix: NextAuth Configuration Reference

### Environment Variables Required

```bash
# Core
AUTH_SECRET=<random-32-char-string>

# Credentials provider (optional, but included by default)
# No env vars needed — uses Prisma User table

# Google OAuth (optional)
AUTH_GOOGLE_ID=<oauth-app-id>
AUTH_GOOGLE_SECRET=<oauth-app-secret>

# Database
DATABASE_URL=file:./volume.db
```

### Generate AUTH_SECRET

```bash
openssl rand -base64 32
# or use: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Session Lifetime

Default: 30 days (configurable in NextAuth)

```typescript
// To customize (in auth.config.ts)
callbacks: {
  async session({ session, token }) {
    // Check token.exp for expiration
    return session;
  },
}
```
