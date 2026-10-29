import { createHash } from 'node:crypto';

/**
 * Demo dataset used by the seed scripts (`prisma/seed.ts`, `prisma/seed-demo.ts`).
 *
 * Pure data: no database access, so it can be unit-tested (see demo-data.spec.ts).
 * Everything is described *relatively* ("due in 3 days", "created 12 days ago") and
 * resolved against `now` when written, so a freshly seeded board always looks current:
 * a few tasks overdue, a few due today, the rest spread over the coming weeks.
 *
 * All addresses use example.com (RFC 2606), which can never receive mail.
 */

export type DemoRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type DemoStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type DemoPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface DemoUser {
  key: string;
  email: string;
  name: string;
}

export interface DemoComment {
  /** User key of the author. */
  by: string;
  text: string;
  /** How long ago the comment was written. */
  hoursAgo: number;
}

export interface DemoTask {
  /** Unique within the project; used to derive a stable id. */
  key: string;
  title: string;
  description?: string;
  status: DemoStatus;
  priority: DemoPriority;
  /** Days from today (negative = overdue). Omit for "no due date". */
  dueInDays?: number;
  createdBy: string;
  assignee?: string;
  createdDaysAgo: number;
  /** Last change; defaults to the creation time. */
  updatedDaysAgo?: number;
  comments?: DemoComment[];
}

export interface DemoProject {
  key: string;
  name: string;
  description: string;
  createdDaysAgo: number;
  members: { user: string; role: DemoRole }[];
  tasks: DemoTask[];
}

export const DEMO_USERS: readonly DemoUser[] = [
  { key: 'alice', email: 'alice@example.com', name: 'Alice Johnson' },
  { key: 'bob', email: 'bob@example.com', name: 'Bob Smith' },
  { key: 'carol', email: 'carol@example.com', name: 'Carol Davis' },
  { key: 'dave', email: 'dave@example.com', name: 'Dave Wilson' },
  { key: 'eve', email: 'eve@example.com', name: 'Eve Martinez' },
  { key: 'frank', email: 'frank@example.com', name: 'Frank Novak' },
  { key: 'grace', email: 'grace@example.com', name: 'Grace Lee' },
];

export const DEMO_PROJECTS: readonly DemoProject[] = [
  {
    key: 'website',
    name: 'Website Redesign',
    description:
      'Complete overhaul of the marketing website: new brand, faster pages, better conversion.',
    createdDaysAgo: 42,
    members: [
      { user: 'alice', role: 'OWNER' },
      { user: 'bob', role: 'ADMIN' },
      { user: 'carol', role: 'MEMBER' },
      { user: 'eve', role: 'MEMBER' },
      { user: 'frank', role: 'MEMBER' },
    ],
    tasks: [
      {
        key: 'audit',
        title: 'Audit current site and collect analytics baseline',
        description:
          'Export bounce rate, top landing pages and Core Web Vitals so we can measure the redesign against real numbers.',
        status: 'DONE',
        priority: 'MEDIUM',
        dueInDays: -28,
        createdBy: 'alice',
        assignee: 'eve',
        createdDaysAgo: 41,
        updatedDaysAgo: 30,
      },
      {
        key: 'about-copy',
        title: 'Write copy for About page',
        description:
          'Short company story, team section and values. Keep it under 300 words.',
        status: 'DONE',
        priority: 'LOW',
        dueInDays: -14,
        createdBy: 'alice',
        assignee: 'carol',
        createdDaysAgo: 30,
        updatedDaysAgo: 16,
        comments: [
          {
            by: 'alice',
            text: 'Approved, thanks Carol. Shipping this as is.',
            hoursAgo: 16 * 24,
          },
        ],
      },
      {
        key: 'design-system',
        title: 'Define colour palette and typography scale',
        description:
          'Light and dark tokens, a type scale from 12 to 48px and spacing rhythm. Deliver as Figma variables.',
        status: 'DONE',
        priority: 'HIGH',
        dueInDays: -10,
        createdBy: 'alice',
        assignee: 'carol',
        createdDaysAgo: 28,
        updatedDaysAgo: 11,
        comments: [
          {
            by: 'carol',
            text: 'Tokens are published in the shared Figma library.',
            hoursAgo: 12 * 24,
          },
          {
            by: 'bob',
            text: 'Great, I will wire these up as CSS variables on our side.',
            hoursAgo: 11 * 24 + 5,
          },
        ],
      },
      {
        key: 'homepage',
        title: 'Design new homepage layout',
        description:
          'Wireframes and high-fidelity mockups for the new homepage: hero, social proof, pricing teaser and footer.',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueInDays: 2,
        createdBy: 'alice',
        assignee: 'carol',
        createdDaysAgo: 20,
        updatedDaysAgo: 1,
        comments: [
          {
            by: 'carol',
            text: "I've pushed the first draft of the wireframes, please take a look.",
            hoursAgo: 9 * 24,
          },
          {
            by: 'alice',
            text: 'Looks great! Can we make the hero section a bit taller on desktop?',
            hoursAgo: 8 * 24 + 6,
          },
          {
            by: 'eve',
            text: 'Social proof could use real logos instead of placeholders. I can send the approved list.',
            hoursAgo: 3 * 24,
          },
          {
            by: 'carol',
            text: 'Updated: taller hero, and swapped in the logo strip. Final polish tomorrow.',
            hoursAgo: 20,
          },
        ],
      },
      {
        key: 'pricing-bug',
        title: 'Fix responsive layout bug on pricing page',
        description:
          'Pricing cards overflow on screens narrower than 375px and the CTA gets clipped.',
        status: 'IN_REVIEW',
        priority: 'URGENT',
        dueInDays: 0,
        createdBy: 'bob',
        assignee: 'bob',
        createdDaysAgo: 5,
        updatedDaysAgo: 0,
        comments: [
          {
            by: 'bob',
            text: 'This is blocking the release, prioritizing it now.',
            hoursAgo: 4 * 24,
          },
          {
            by: 'bob',
            text: 'PR is up. Cards now stack below 400px; please check it on a real iPhone SE.',
            hoursAgo: 6,
          },
        ],
      },
      {
        key: 'ci',
        title: 'Set up CI/CD pipeline',
        description:
          'Configure GitHub Actions: lint, unit tests, preview deploys for every pull request and production deploys from main.',
        status: 'TODO',
        priority: 'MEDIUM',
        dueInDays: 9,
        createdBy: 'alice',
        assignee: 'bob',
        createdDaysAgo: 14,
      },
      {
        key: 'seo',
        title: 'SEO: meta tags, sitemap and structured data',
        description:
          'Unique titles and descriptions per page, sitemap.xml, Open Graph images.',
        status: 'TODO',
        priority: 'MEDIUM',
        dueInDays: 16,
        createdBy: 'alice',
        assignee: 'frank',
        createdDaysAgo: 12,
      },
      {
        key: 'a11y',
        title: 'Accessibility pass (WCAG 2.2 AA)',
        description:
          'Keyboard navigation, focus states, colour contrast and screen-reader labels across all templates.',
        status: 'TODO',
        priority: 'HIGH',
        dueInDays: -2,
        createdBy: 'alice',
        assignee: 'alice',
        createdDaysAgo: 18,
        comments: [
          {
            by: 'eve',
            text: 'Contrast on the secondary button is 3.8:1. We need at least 4.5:1.',
            hoursAgo: 2 * 24,
          },
        ],
      },
      {
        key: 'blog',
        title: 'Migrate blog posts to the new CMS',
        status: 'IN_PROGRESS',
        priority: 'LOW',
        dueInDays: 21,
        createdBy: 'bob',
        assignee: 'frank',
        createdDaysAgo: 9,
        updatedDaysAgo: 2,
      },
      {
        key: 'perf',
        title: 'Image optimisation and lazy loading',
        description:
          'Serve WebP/AVIF, set explicit dimensions and lazy-load below the fold.',
        status: 'TODO',
        priority: 'LOW',
        createdBy: 'bob',
        createdDaysAgo: 6,
      },
    ],
  },
  {
    key: 'mobile',
    name: 'Mobile App Launch',
    description:
      'Native iOS and Android app. Target: public release in six weeks.',
    createdDaysAgo: 35,
    members: [
      { user: 'bob', role: 'OWNER' },
      { user: 'alice', role: 'ADMIN' },
      { user: 'dave', role: 'MEMBER' },
      { user: 'grace', role: 'MEMBER' },
    ],
    tasks: [
      {
        key: 'auth-flow',
        title: 'Sign-in and onboarding screens',
        status: 'DONE',
        priority: 'HIGH',
        dueInDays: -12,
        createdBy: 'bob',
        assignee: 'grace',
        createdDaysAgo: 33,
        updatedDaysAgo: 13,
      },
      {
        key: 'api-client',
        title: 'Generate typed API client from OpenAPI',
        description:
          'Keep the app and the backend in sync automatically in CI.',
        status: 'DONE',
        priority: 'MEDIUM',
        dueInDays: -9,
        createdBy: 'bob',
        assignee: 'dave',
        createdDaysAgo: 30,
        updatedDaysAgo: 10,
      },
      {
        key: 'push',
        title: 'Implement push notifications',
        description:
          'Integrate Firebase Cloud Messaging for iOS and Android: task assigned, comment mention, due soon.',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueInDays: 6,
        createdBy: 'bob',
        assignee: 'dave',
        createdDaysAgo: 16,
        updatedDaysAgo: 0,
        comments: [
          {
            by: 'dave',
            text: 'Firebase setup is done, working on the notification handlers next.',
            hoursAgo: 5 * 24,
          },
          {
            by: 'bob',
            text: 'Remember the iOS permission prompt copy. Product wants to review it.',
            hoursAgo: 4 * 24,
          },
          {
            by: 'dave',
            text: 'Android handlers merged. iOS is waiting on the APNs certificate.',
            hoursAgo: 7,
          },
        ],
      },
      {
        key: 'offline',
        title: 'Offline mode: cache tasks and sync on reconnect',
        description:
          'Read-only cache first; queued edits can follow in a later release.',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        dueInDays: 12,
        createdBy: 'alice',
        assignee: 'grace',
        createdDaysAgo: 11,
        updatedDaysAgo: 1,
      },
      {
        key: 'crash',
        title: 'Fix crash when opening a task without an assignee',
        description:
          'Reproducible on Android 12. Null assignee is not handled in the detail view.',
        status: 'IN_REVIEW',
        priority: 'URGENT',
        dueInDays: 1,
        createdBy: 'grace',
        assignee: 'alice',
        createdDaysAgo: 3,
        updatedDaysAgo: 0,
        comments: [
          {
            by: 'grace',
            text: 'Stack trace attached to the crash report. Happens only with deep links.',
            hoursAgo: 2 * 24,
          },
          {
            by: 'alice',
            text: 'Found it, fix is in the review queue.',
            hoursAgo: 3,
          },
        ],
      },
      {
        key: 'store',
        title: 'App Store submission checklist',
        description:
          'Screenshots, privacy labels, age rating, review notes and a demo account for the reviewers.',
        status: 'TODO',
        priority: 'MEDIUM',
        dueInDays: 14,
        createdBy: 'bob',
        assignee: 'bob',
        createdDaysAgo: 8,
      },
      {
        key: 'dark',
        title: 'Dark mode for all screens',
        status: 'TODO',
        priority: 'LOW',
        dueInDays: 25,
        createdBy: 'alice',
        assignee: 'grace',
        createdDaysAgo: 7,
      },
      {
        key: 'beta',
        title: 'Recruit 50 beta testers',
        description:
          'TestFlight and Play Console internal track. Collect feedback via a short survey.',
        status: 'TODO',
        priority: 'HIGH',
        dueInDays: 5,
        createdBy: 'bob',
        createdDaysAgo: 4,
      },
    ],
  },
  {
    key: 'internal',
    name: 'Internal Tools',
    description: 'Dashboards and admin tooling for the team.',
    createdDaysAgo: 30,
    members: [
      { user: 'carol', role: 'OWNER' },
      { user: 'alice', role: 'MEMBER' },
      { user: 'dave', role: 'MEMBER' },
    ],
    tasks: [
      {
        key: 'analytics',
        title: 'Build analytics dashboard',
        description:
          'Show task completion rates, cycle time and team velocity per sprint with simple charts.',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        dueInDays: 8,
        createdBy: 'carol',
        assignee: 'alice',
        createdDaysAgo: 15,
        updatedDaysAgo: 1,
        comments: [
          {
            by: 'alice',
            text: 'Velocity chart is in. Next up: burn-down and an export to CSV.',
            hoursAgo: 30,
          },
        ],
      },
      {
        key: 'design-migration',
        title: 'Migrate admin panel to the new design system',
        status: 'IN_PROGRESS',
        priority: 'LOW',
        dueInDays: 18,
        createdBy: 'carol',
        assignee: 'dave',
        createdDaysAgo: 13,
        updatedDaysAgo: 3,
      },
      {
        key: 'audit-log',
        title: 'Add audit log for admin actions',
        description:
          'Who changed what and when. Needed for the upcoming security review.',
        status: 'TODO',
        priority: 'HIGH',
        dueInDays: 4,
        createdBy: 'carol',
        assignee: 'alice',
        createdDaysAgo: 6,
      },
      {
        key: 'backups',
        title: 'Automate nightly database backups',
        status: 'DONE',
        priority: 'URGENT',
        dueInDays: -6,
        createdBy: 'carol',
        assignee: 'dave',
        createdDaysAgo: 22,
        updatedDaysAgo: 7,
        comments: [
          {
            by: 'dave',
            text: 'Backups run at 02:00 UTC and are kept for 30 days. Restore tested.',
            hoursAgo: 7 * 24,
          },
        ],
      },
      {
        key: 'slack',
        title: 'Slack alerts for failed deployments',
        status: 'TODO',
        priority: 'MEDIUM',
        createdBy: 'dave',
        createdDaysAgo: 5,
      },
      {
        key: 'docs',
        title: 'Write onboarding docs for new engineers',
        status: 'TODO',
        priority: 'LOW',
        dueInDays: 30,
        createdBy: 'alice',
        assignee: 'carol',
        createdDaysAgo: 3,
      },
    ],
  },
  {
    key: 'marketing',
    name: 'Q4 Marketing Campaign',
    description: 'Launch campaign across email, social and paid channels.',
    createdDaysAgo: 24,
    members: [
      { user: 'eve', role: 'OWNER' },
      { user: 'alice', role: 'ADMIN' },
      { user: 'frank', role: 'MEMBER' },
      { user: 'grace', role: 'MEMBER' },
    ],
    tasks: [
      {
        key: 'brief',
        title: 'Finalise campaign brief and goals',
        description: 'Audience, key message, budget split and success metrics.',
        status: 'DONE',
        priority: 'HIGH',
        dueInDays: -15,
        createdBy: 'eve',
        assignee: 'eve',
        createdDaysAgo: 23,
        updatedDaysAgo: 16,
      },
      {
        key: 'video',
        title: 'Produce 30-second product video',
        description:
          'Script approved. Needs voice-over, captions and a vertical cut for social.',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueInDays: 3,
        createdBy: 'eve',
        assignee: 'grace',
        createdDaysAgo: 14,
        updatedDaysAgo: 1,
        comments: [
          {
            by: 'grace',
            text: 'Rough cut is ready. Vertical version still needs captions.',
            hoursAgo: 28,
          },
          {
            by: 'eve',
            text: 'Love it. Can the logo stay on screen a second longer at the end?',
            hoursAgo: 22,
          },
        ],
      },
      {
        key: 'emails',
        title: 'Write 4-part launch email sequence',
        status: 'IN_REVIEW',
        priority: 'MEDIUM',
        dueInDays: 1,
        createdBy: 'eve',
        assignee: 'frank',
        createdDaysAgo: 10,
        updatedDaysAgo: 0,
        comments: [
          {
            by: 'frank',
            text: 'All four drafts are in the shared doc. Subject lines have two A/B variants each.',
            hoursAgo: 10,
          },
        ],
      },
      {
        key: 'landing',
        title: 'Build campaign landing page',
        description:
          'Reuse the new design system. Needs a sign-up form wired to the CRM.',
        status: 'TODO',
        priority: 'HIGH',
        dueInDays: 7,
        createdBy: 'alice',
        assignee: 'alice',
        createdDaysAgo: 9,
      },
      {
        key: 'social',
        title: 'Social media content calendar',
        status: 'TODO',
        priority: 'MEDIUM',
        dueInDays: 5,
        createdBy: 'eve',
        assignee: 'grace',
        createdDaysAgo: 8,
      },
      {
        key: 'ads',
        title: 'Set up paid ads and conversion tracking',
        status: 'TODO',
        priority: 'MEDIUM',
        dueInDays: 11,
        createdBy: 'eve',
        assignee: 'frank',
        createdDaysAgo: 6,
      },
      {
        key: 'press',
        title: 'Press kit and outreach list',
        status: 'TODO',
        priority: 'LOW',
        dueInDays: -1,
        createdBy: 'frank',
        assignee: 'eve',
        createdDaysAgo: 12,
      },
    ],
  },
  {
    key: 'onboarding',
    name: 'Customer Onboarding Revamp',
    description: 'Cut time-to-first-value for new customers from 7 days to 2.',
    createdDaysAgo: 18,
    members: [
      { user: 'grace', role: 'OWNER' },
      { user: 'dave', role: 'ADMIN' },
      { user: 'alice', role: 'MEMBER' },
      { user: 'bob', role: 'MEMBER' },
    ],
    tasks: [
      {
        key: 'interviews',
        title: 'Interview 8 recent customers about their first week',
        description:
          'Find where people get stuck. Record, tag and summarise the findings.',
        status: 'DONE',
        priority: 'HIGH',
        dueInDays: -5,
        createdBy: 'grace',
        assignee: 'grace',
        createdDaysAgo: 17,
        updatedDaysAgo: 6,
        comments: [
          {
            by: 'grace',
            text: 'Top finding: people do not know they can invite teammates during setup.',
            hoursAgo: 6 * 24,
          },
        ],
      },
      {
        key: 'checklist',
        title: 'In-app setup checklist',
        description:
          'Create project, invite a teammate, add three tasks. Celebrate when done.',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueInDays: 4,
        createdBy: 'grace',
        assignee: 'alice',
        createdDaysAgo: 10,
        updatedDaysAgo: 0,
        comments: [
          {
            by: 'alice',
            text: 'Prototype is working. Should the checklist hide itself once all steps are done?',
            hoursAgo: 14,
          },
          {
            by: 'grace',
            text: 'Yes, but keep a small "Setup complete" badge in the sidebar for a week.',
            hoursAgo: 11,
          },
        ],
      },
      {
        key: 'templates',
        title: 'Starter project templates',
        description: 'Software sprint, marketing launch and personal to-do.',
        status: 'TODO',
        priority: 'MEDIUM',
        dueInDays: 13,
        createdBy: 'dave',
        assignee: 'bob',
        createdDaysAgo: 8,
      },
      {
        key: 'welcome-email',
        title: 'Rewrite the welcome email',
        status: 'IN_REVIEW',
        priority: 'LOW',
        dueInDays: 2,
        createdBy: 'grace',
        assignee: 'dave',
        createdDaysAgo: 7,
        updatedDaysAgo: 1,
      },
      {
        key: 'metrics',
        title: 'Track activation funnel events',
        description:
          'Sign-up, first project, first invite, first completed task.',
        status: 'TODO',
        priority: 'MEDIUM',
        dueInDays: 9,
        createdBy: 'dave',
        createdDaysAgo: 4,
      },
    ],
  },
];

/** Deterministic UUID (v5 layout) so re-running the seed addresses the same rows. */
export function demoId(...parts: string[]): string {
  const hash = createHash('sha1')
    .update(`sprint-line-demo:${parts.join(':')}`)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * HOUR_MS);
}

/** Due dates land at 17:00 UTC, matching what the web client sends. */
export function dueDate(now: Date, inDays: number): Date {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17),
  );
  date.setUTCDate(date.getUTCDate() + inDays);
  return date;
}
