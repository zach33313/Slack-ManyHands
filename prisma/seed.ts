/**
 * prisma/seed.ts
 *
 * Seeds the database with demo data for local development.
 * Run with: npx tsx prisma/seed.ts
 * Or via:   npx prisma db seed
 *
 * Creates:
 *   - 6 demo users with bcrypt-hashed passwords
 *   - 1 workspace ("MakeHands", slug: "makehands")
 *   - All users as workspace members
 *   - 3 channels (#general PUBLIC, #random PUBLIC, #engineering PRIVATE)
 *   - Channel memberships
 *   - Sample messages in #general
 *   - Thread replies
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

  const passwordHash = hashSync('password', 10);

  const gray = await prisma.user.create({
    data: {
      name: 'Gray',
      email: 'gray@demo.com',
      password: passwordHash,
      title: 'Co-Founder',
      statusText: 'Shipping features',
      statusEmoji: '⚡',
      timezone: 'America/Los_Angeles',
    },
  });

  const zach = await prisma.user.create({
    data: {
      name: 'Zach',
      email: 'zach@demo.com',
      password: passwordHash,
      title: 'Co-Founder',
      statusText: 'Building things',
      statusEmoji: '🛠️',
      timezone: 'America/Los_Angeles',
    },
  });

  const conor = await prisma.user.create({
    data: {
      name: 'Conor',
      email: 'conor@demo.com',
      password: passwordHash,
      title: 'Engineer',
      statusText: 'In the zone',
      statusEmoji: '🎯',
      timezone: 'America/New_York',
    },
  });

  const amaey = await prisma.user.create({
    data: {
      name: 'Amaey',
      email: 'amaey@demo.com',
      password: passwordHash,
      title: 'Engineer',
      statusText: 'Reviewing PRs',
      statusEmoji: '👀',
      timezone: 'America/New_York',
    },
  });

  const leo = await prisma.user.create({
    data: {
      name: 'Leo',
      email: 'leo@demo.com',
      password: passwordHash,
      title: 'Engineer',
      statusText: 'Heads down',
      statusEmoji: '💻',
      timezone: 'America/Los_Angeles',
    },
  });

  const alice = await prisma.user.create({
    data: {
      name: 'Alice Johnson',
      email: 'alice@test.com',
      password: passwordHash,
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
      title: 'Frontend Developer',
      statusText: 'In a meeting',
      statusEmoji: '📅',
      timezone: 'America/Los_Angeles',
    },
  });

  const allUsers = [gray, zach, conor, amaey, leo, alice, bob];

  console.log(`  Created users: ${allUsers.map(u => u.name).join(', ')}`);

  // -------------------------------------------------------------------------
  // Workspace
  // -------------------------------------------------------------------------

  const workspace = await prisma.workspace.create({
    data: {
      name: 'MakeHands',
      slug: 'makehands',
      ownerId: zach.id,
    },
  });

  console.log(`  Created workspace: ${workspace.name} (slug: ${workspace.slug})`);

  // -------------------------------------------------------------------------
  // Workspace Members
  // -------------------------------------------------------------------------

  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: zach.id, role: 'OWNER' },
  });

  for (const user of [gray, conor, amaey, alice, bob]) {
    await prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: 'MEMBER' },
    });
  }

  console.log('  Added all users as workspace members (Zach=OWNER, rest=MEMBER)');

  // -------------------------------------------------------------------------
  // Channels
  // -------------------------------------------------------------------------

  const general = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'general',
      description: 'Company-wide announcements and general discussion',
      type: 'PUBLIC',
      createdById: gray.id,
    },
  });

  const random = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'random',
      description: 'Non-work banter and water cooler chat',
      type: 'PUBLIC',
      createdById: gray.id,
    },
  });

  const engineering = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'engineering',
      description: 'Engineering team discussions',
      type: 'PRIVATE',
      createdById: zach.id,
    },
  });

  console.log(`  Created channels: #${general.name}, #${random.name}, #${engineering.name}`);

  // -------------------------------------------------------------------------
  // Channel Members
  // -------------------------------------------------------------------------

  // All users in #general and #random
  for (const channel of [general, random]) {
    for (const user of allUsers) {
      await prisma.channelMember.create({
        data: { channelId: channel.id, userId: user.id },
      });
    }
  }

  // Engineering: gray, zach, conor, amaey
  for (const user of [gray, zach, conor, amaey, leo]) {
    await prisma.channelMember.create({
      data: { channelId: engineering.id, userId: user.id },
    });
  }

  console.log('  Added channel memberships');

  // -------------------------------------------------------------------------
  // Messages in #general
  // -------------------------------------------------------------------------

  const messageTexts = [
    { userId: gray.id, text: 'Welcome to MakeHands! 👋 Excited to get this going.' },
    { userId: zach.id, text: 'Let\'s gooo. First order of business: ship the MVP.' },
    { userId: conor.id, text: 'On it. PR is up for the auth flow.' },
    { userId: amaey.id, text: 'Just joined! What should I start on?' },
    { userId: gray.id, text: '@amaey check out the open issues, lots of good first tasks.' },
    { userId: zach.id, text: 'Also the video calling feature needs some love.' },
    { userId: alice.id, text: 'Hey everyone! Happy to be here 🎉' },
    { userId: bob.id, text: 'Same! Looking forward to contributing.' },
    { userId: conor.id, text: 'Welcome aboard! Feel free to ask anything in here.' },
    { userId: gray.id, text: 'Great to have the full team together. Let\'s build something awesome.' },
  ];

  const messages: Array<{ id: string }> = [];

  for (let i = 0; i < messageTexts.length; i++) {
    const { userId, text } = messageTexts[i];
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
  // Thread replies on the first message
  // -------------------------------------------------------------------------

  const firstMessage = messages[0];

  await prisma.message.create({
    data: {
      channelId: general.id,
      userId: zach.id,
      contentJson: tiptapDoc('LFG 🚀'),
      contentPlain: 'LFG 🚀',
      parentId: firstMessage.id,
      createdAt: new Date(Date.now() - 40 * 60 * 1000),
    },
  });

  await prisma.message.create({
    data: {
      channelId: general.id,
      userId: conor.id,
      contentJson: tiptapDoc('Hyped to be part of this!'),
      contentPlain: 'Hyped to be part of this!',
      parentId: firstMessage.id,
      createdAt: new Date(Date.now() - 35 * 60 * 1000),
    },
  });

  await prisma.message.update({
    where: { id: firstMessage.id },
    data: { replyCount: 2 },
  });

  console.log('  Created 2 thread replies on the first message');

  console.log('\nSeed complete!');
  console.log('\nDemo accounts (all passwords: "password"):');
  console.log('  gray@demo.com');
  console.log('  zach@demo.com');
  console.log('  conor@demo.com');
  console.log('  amaey@demo.com');
  console.log('  leo@demo.com');
  console.log('  alice@test.com');
  console.log('  bob@test.com');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
