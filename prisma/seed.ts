/**
 * prisma/seed.ts
 *
 * Seeds the database with demo data.
 * Run with: npx tsx prisma/seed.ts
 * Or via:   npx prisma db seed
 *
 * Creates:
 *   - 7 demo users (zach is workspace owner with real password)
 *   - 1 workspace ("ManyHands", slug: "manyhands")
 *   - 3 channels (#general, #random, #manyhands-discussion)
 *   - Seeded messages per channel
 */

import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

/** Create a Tiptap JSON document from plain text (supports line breaks) */
function tiptapDoc(text: string): string {
  const paragraphs = text.split('\n').map((line) => ({
    type: 'paragraph' as const,
    content: line ? [{ type: 'text' as const, text: line }] : [],
  }));
  return JSON.stringify({ type: 'doc', content: paragraphs });
}

/** Create a Tiptap JSON document with a link */
function tiptapDocWithLink(before: string, linkText: string, url: string, after: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: before },
          {
            type: 'text',
            marks: [{ type: 'link', attrs: { href: url, target: '_blank' } }],
            text: linkText,
          },
          { type: 'text', text: after },
        ],
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

  const defaultPasswordHash = hashSync('password', 10);
  const zachPasswordHash = hashSync('zach@manyhands.dev+zach@manyhands.dev+zach@manyhands.dev', 12);

  const zach = await prisma.user.create({
    data: {
      name: 'Zach',
      email: 'zach@manyhands.dev',
      password: zachPasswordHash,
      title: 'Co-Founder',
      statusText: 'Building things',
      statusEmoji: '🛠️',
      timezone: 'America/Los_Angeles',
    },
  });

  const gray = await prisma.user.create({
    data: {
      name: 'Gray',
      email: 'gray@demo.com',
      password: defaultPasswordHash,
      title: 'Co-Founder',
      statusText: 'Shipping features',
      statusEmoji: '⚡',
      timezone: 'America/Los_Angeles',
    },
  });

  const conor = await prisma.user.create({
    data: {
      name: 'Conor',
      email: 'conor@demo.com',
      password: defaultPasswordHash,
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
      password: defaultPasswordHash,
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
      password: defaultPasswordHash,
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
      password: defaultPasswordHash,
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
      password: defaultPasswordHash,
      title: 'Frontend Developer',
      statusText: 'In a meeting',
      statusEmoji: '📅',
      timezone: 'America/Los_Angeles',
    },
  });

  const allUsers = [zach, gray, conor, amaey, leo, alice, bob];

  console.log(`  Created users: ${allUsers.map(u => u.name).join(', ')}`);

  // -------------------------------------------------------------------------
  // Workspace
  // -------------------------------------------------------------------------

  const workspace = await prisma.workspace.create({
    data: {
      name: 'ManyHands',
      slug: 'manyhands',
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

  for (const user of [gray, conor, amaey, leo, alice, bob]) {
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
      createdById: zach.id,
    },
  });

  const random = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'random',
      description: 'Non-work banter and water cooler chat',
      type: 'PUBLIC',
      createdById: zach.id,
    },
  });

  const mhDiscussion = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'manyhands-discussion',
      description: 'Discussion about the ManyHands orchestration platform',
      type: 'PUBLIC',
      createdById: zach.id,
    },
  });

  console.log(`  Created channels: #${general.name}, #${random.name}, #${mhDiscussion.name}`);

  // -------------------------------------------------------------------------
  // Channel Members
  // -------------------------------------------------------------------------

  for (const channel of [general, random, mhDiscussion]) {
    for (const user of allUsers) {
      await prisma.channelMember.create({
        data: { channelId: channel.id, userId: user.id },
      });
    }
  }

  console.log('  Added channel memberships');

  // -------------------------------------------------------------------------
  // #general — Welcome message from Zach
  // -------------------------------------------------------------------------

  const generalWelcome = tiptapDocWithLink(
    'Welcome to the ManyHands Slack Demo! View the source code here: ',
    'github.com/zach33313/Slack-ManyHands',
    'https://github.com/zach33313/Slack-ManyHands',
    '. Feel free to build on it, or use it as a ManyHands external code base to make your perfect Slack!'
  );

  await prisma.message.create({
    data: {
      channelId: general.id,
      userId: zach.id,
      contentJson: generalWelcome,
      contentPlain: 'Welcome to the ManyHands Slack Demo! View the source code here: https://github.com/zach33313/Slack-ManyHands. Feel free to build on it, or use it as a ManyHands external code base to make your perfect Slack!',
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  });

  console.log('  Created welcome message in #general');

  // -------------------------------------------------------------------------
  // #random — Bladee message
  // -------------------------------------------------------------------------

  await prisma.message.create({
    data: {
      channelId: random.id,
      userId: zach.id,
      contentJson: tiptapDoc('you should listen to bladee'),
      contentPlain: 'you should listen to bladee',
      createdAt: new Date(Date.now() - 45 * 60 * 1000),
    },
  });

  console.log('  Created message in #random');

  // -------------------------------------------------------------------------
  // #manyhands-discussion — Build story
  // -------------------------------------------------------------------------

  const buildStory = [
    'This product was built with ManyHands over 2 iterations.',
    '',
    'The first iteration built the core Slack components using Opus for implementation. The run lasted ~1.5 hours before exceeding my session limit. There were roughly 2 clean-up prompts needed after the build finished (~1 hour of clean-up prompts and testing the product).',
    '',
    'The 2nd run used the orchestration_iterate MCP tool to take the build and add voice and video calling along with some miscellaneous UI fixes that I let the queen decide. That ran for ~4 hours with Sonnet as the implementation model. This involved more clean-up prompts and this should have been an Opus-type project. Maybe ~1.5 hours of clean-up again, but testing took longer due to the need for other users.',
    '',
    'Total build time over the 2 sessions was 6 hours, with an estimated cost in USD of $160 (roughly 2 20x Sessions). Human clean-up time: 2 hours not including testing. Majority of issues stemmed from the first build running out of tokens before QA happened. Optimizations have since been made to reduce the total token usage by 2.5x (this was not in place during the build).',
  ].join('\n');

  await prisma.message.create({
    data: {
      channelId: mhDiscussion.id,
      userId: zach.id,
      contentJson: tiptapDoc(buildStory),
      contentPlain: buildStory,
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    },
  });

  console.log('  Created build story in #manyhands-discussion');

  console.log('\nSeed complete!');
  console.log('\nAdmin account:');
  console.log('  zach@manyhands.dev (password: zach@manyhands.dev+zach@manyhands.dev+zach@manyhands.dev)');
  console.log('\nOther seeded accounts (all passwords: "password"):');
  console.log('  gray@demo.com, conor@demo.com, amaey@demo.com,');
  console.log('  leo@demo.com, alice@test.com, bob@test.com');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
