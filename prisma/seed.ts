/**
 * prisma/seed.ts
 *
 * Seeds the database with demo data for local development.
 * Run with: npx tsx prisma/seed.ts
 * Or via:   npx prisma db seed
 *
 * Creates:
 *   - 2 demo users (alice@test.com, bob@test.com) with bcrypt-hashed passwords
 *   - 1 workspace ("Acme Corp", slug: "acme")
 *   - Both users as workspace members (Alice=OWNER, Bob=MEMBER)
 *   - 3 channels (#general PUBLIC, #random PUBLIC, #secret PRIVATE)
 *   - Channel memberships
 *   - 10 sample messages in #general
 *   - 2 thread replies on the first message
 */

import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

/** Create a Tiptap JSON document string from plain text */
function tiptapDoc(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  });
}

async function main() {
  console.log('Seeding database...');

  // Clean existing data (in reverse dependency order)
  await prisma.notification.deleteMany();
  await prisma.customEmoji.deleteMany();
  await prisma.bookmark.deleteMany();
  await prisma.pin.deleteMany();
  await prisma.reaction.deleteMany();
  await prisma.fileAttachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.channelMember.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  const passwordHash = hashSync('password123', 10);

  const alice = await prisma.user.create({
    data: {
      name: 'Alice Johnson',
      email: 'alice@test.com',
      password: passwordHash,
      image: null,
      title: 'Engineering Lead',
      statusText: 'Building cool things',
      statusEmoji: '🚀',
      timezone: 'America/New_York',
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: 'Bob Smith',
      email: 'bob@test.com',
      password: passwordHash,
      image: null,
      title: 'Frontend Developer',
      statusText: 'In a meeting',
      statusEmoji: '📅',
      timezone: 'America/Los_Angeles',
    },
  });

  console.log(`  Created users: ${alice.name}, ${bob.name}`);

  // -------------------------------------------------------------------------
  // Workspace
  // -------------------------------------------------------------------------

  const workspace = await prisma.workspace.create({
    data: {
      name: 'Acme Corp',
      slug: 'acme',
      ownerId: alice.id,
    },
  });

  console.log(`  Created workspace: ${workspace.name} (slug: ${workspace.slug})`);

  // -------------------------------------------------------------------------
  // Workspace Members
  // -------------------------------------------------------------------------

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: alice.id,
      role: 'OWNER',
    },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: bob.id,
      role: 'MEMBER',
    },
  });

  console.log('  Added workspace members: Alice (OWNER), Bob (MEMBER)');

  // -------------------------------------------------------------------------
  // Channels
  // -------------------------------------------------------------------------

  const general = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'general',
      description: 'Company-wide announcements and general discussion',
      type: 'PUBLIC',
      createdById: alice.id,
    },
  });

  const random = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'random',
      description: 'Non-work banter and water cooler chat',
      type: 'PUBLIC',
      createdById: alice.id,
    },
  });

  const secret = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'secret',
      description: 'Private channel for leadership team',
      type: 'PRIVATE',
      createdById: alice.id,
    },
  });

  console.log(`  Created channels: #${general.name}, #${random.name}, #${secret.name}`);

  // -------------------------------------------------------------------------
  // Channel Members
  // -------------------------------------------------------------------------

  // Both users in #general and #random
  for (const channel of [general, random]) {
    for (const user of [alice, bob]) {
      await prisma.channelMember.create({
        data: {
          channelId: channel.id,
          userId: user.id,
        },
      });
    }
  }

  // Only Alice in #secret
  await prisma.channelMember.create({
    data: {
      channelId: secret.id,
      userId: alice.id,
    },
  });

  console.log('  Added channel memberships');

  // -------------------------------------------------------------------------
  // 10 Messages in #general
  // -------------------------------------------------------------------------

  const messageTexts = [
    { userId: alice.id, text: 'Welcome to the Acme Corp workspace! 👋' },
    { userId: bob.id, text: "Thanks Alice! Excited to be here." },
    { userId: alice.id, text: "Let's use this channel for general announcements." },
    { userId: bob.id, text: 'Sounds good. Where should I post project updates?' },
    { userId: alice.id, text: 'You can create a new channel for your project or post here.' },
    { userId: bob.id, text: "I'll create a #frontend channel later." },
    { userId: alice.id, text: 'Perfect. Also check out #random for casual chat.' },
    { userId: bob.id, text: 'Already joined it! 😄' },
    { userId: alice.id, text: "Great! Let me know if you need anything else." },
    { userId: bob.id, text: 'Will do. Looking forward to working together!' },
  ];

  const messages: Array<{ id: string }> = [];

  for (let i = 0; i < messageTexts.length; i++) {
    const { userId, text } = messageTexts[i];
    // Space messages 5 minutes apart
    const createdAt = new Date(Date.now() - (messageTexts.length - i) * 5 * 60 * 1000);

    const message = await prisma.message.create({
      data: {
        channelId: general.id,
        userId,
        contentJson: tiptapDoc(text),
        contentPlain: text,
        createdAt,
      },
    });

    messages.push(message);
  }

  console.log(`  Created ${messages.length} messages in #general`);

  // -------------------------------------------------------------------------
  // 2 Thread replies on the first message
  // -------------------------------------------------------------------------

  const firstMessage = messages[0];

  await prisma.message.create({
    data: {
      channelId: general.id,
      userId: bob.id,
      contentJson: tiptapDoc('Thanks for the warm welcome! 🎉'),
      contentPlain: 'Thanks for the warm welcome! 🎉',
      parentId: firstMessage.id,
      createdAt: new Date(Date.now() - 40 * 60 * 1000),
    },
  });

  await prisma.message.create({
    data: {
      channelId: general.id,
      userId: alice.id,
      contentJson: tiptapDoc('Happy to have you on the team, Bob!'),
      contentPlain: 'Happy to have you on the team, Bob!',
      parentId: firstMessage.id,
      createdAt: new Date(Date.now() - 35 * 60 * 1000),
    },
  });

  // Update reply count on parent message
  await prisma.message.update({
    where: { id: firstMessage.id },
    data: { replyCount: 2 },
  });

  console.log('  Created 2 thread replies on the first message');

  console.log('\nSeed complete!');
  console.log('\nDemo accounts:');
  console.log('  alice@test.com / password123');
  console.log('  bob@test.com   / password123');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
