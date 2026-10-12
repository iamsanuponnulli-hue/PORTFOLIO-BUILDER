import { PortfolioContent, type ProfileType } from '@pb/schema';
import { defaultSpec } from './defaults.ts';
import type { SiteState } from './types.ts';

/**
 * Fictional sample people, one per profile type. Used by the dev gallery, the tests
 * and (later) the design-direction thumbnails before a user has added content.
 */
export const SAMPLE_CONTENT: Record<ProfileType, PortfolioContent> = {
  developer: PortfolioContent.parse({
    profile: {
      name: 'Jane Doe',
      headline: 'Full-stack engineer building fast, accessible web apps',
      tagline: 'I turn messy product ideas into reliable software people enjoy using.',
      bio: 'I have spent six years shipping web products at startups and one large retailer.\n\nI care about performance budgets, good error messages and code the next person can read. Outside work I maintain two open-source libraries and mentor at a local coding bootcamp.',
      location: 'Lisbon, Portugal',
      email: 'jane@example.com',
      socials: [
        { label: 'GitHub', url: 'https://github.com/janedoe' },
        { label: 'LinkedIn', url: 'https://www.linkedin.com/in/janedoe' },
      ],
    },
    experience: [
      {
        id: 'e1',
        company: 'Brightcart',
        role: 'Senior Software Engineer',
        start: '2022',
        end: 'Present',
        location: 'Remote',
        bullets: [
          'Led the checkout rewrite that cut page load time from 4.1s to 1.3s.',
          'Introduced end-to-end tests that caught 30+ regressions before release.',
        ],
        tech: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
      },
      {
        id: 'e2',
        company: 'Fernway',
        role: 'Software Engineer',
        start: '2019',
        end: '2022',
        location: 'Porto',
        bullets: [
          'Built the booking API used by 200 partner hotels.',
          'Moved deployments from weekly to daily.',
        ],
        tech: ['Go', 'Kubernetes'],
      },
    ],
    projects: [
      {
        id: 'p1',
        title: 'Tidepool',
        summary: 'An open-source offline-first notes app with end-to-end encrypted sync.',
        role: 'Creator and maintainer',
        tech: ['TypeScript', 'IndexedDB'],
        tags: ['Open source', 'Web'],
        links: [
          { label: 'GitHub', url: 'https://github.com/janedoe/tidepool' },
          { label: 'Live demo', url: 'https://tidepool.example.com' },
        ],
        featured: true,
      },
      {
        id: 'p2',
        title: 'Railgraph',
        summary: 'Interactive map of European night trains with live delay data.',
        tech: ['D3', 'Vite'],
        tags: ['Data viz', 'Web'],
        links: [{ label: 'Live site', url: 'https://railgraph.example.com' }],
      },
      {
        id: 'p3',
        title: 'pg-snap',
        summary: 'CLI that snapshots and restores PostgreSQL test databases in under a second.',
        tech: ['Go'],
        tags: ['Open source', 'CLI'],
        links: [{ label: 'GitHub', url: 'https://github.com/janedoe/pg-snap' }],
      },
    ],
    skills: [
      { group: 'Languages', items: ['TypeScript', 'Go', 'SQL', 'Python'] },
      { group: 'Frameworks', items: ['React', 'Node.js', 'Next.js'] },
      { group: 'Tools', items: ['PostgreSQL', 'Docker', 'Kubernetes', 'GitHub Actions'] },
    ],
    writing: [
      {
        id: 'w1',
        title: 'What a 3-second checkout taught me about caching',
        issuer: 'Blog',
        date: 'Mar 2026',
        url: 'https://janedoe.dev/blog/checkout-caching',
      },
      {
        id: 'w2',
        title: 'Offline-first without the pain',
        issuer: 'Blog',
        date: 'Nov 2025',
        url: 'https://janedoe.dev/blog/offline-first',
      },
    ],
  }),

  designer: PortfolioContent.parse({
    profile: {
      name: 'Sam Rivera',
      headline: 'Product designer for health and finance apps',
      tagline: 'Clear interfaces for decisions that matter.',
      bio: 'I design products people use when the stakes are high: managing a chronic condition, or a household budget.\n\nI work from research to shipped pixels, and I like being in the room with engineers.',
      location: 'Toronto, Canada',
      email: 'sam@example.com',
      socials: [
        { label: 'Dribbble', url: 'https://dribbble.com/samrivera' },
        { label: 'LinkedIn', url: 'https://www.linkedin.com/in/samrivera' },
      ],
    },
    experience: [
      {
        id: 'e1',
        company: 'Northbeam Health',
        role: 'Lead Product Designer',
        start: '2021',
        end: 'Present',
      },
      { id: 'e2', company: 'Ledgerly', role: 'Product Designer', start: '2018', end: '2021' },
    ],
    projects: [
      {
        id: 'p1',
        title: 'Glucose diary redesign',
        summary: 'Made daily logging 3x faster for people with type 1 diabetes.',
        role: 'Lead designer',
        tags: ['Mobile', 'Health'],
        featured: true,
        caseStudy: {
          problem:
            'People logged their glucose readings less over time because each entry took eight taps.',
          role: 'I led research, design and usability testing with a team of four engineers.',
          process:
            'We interviewed 18 people, mapped the logging moments in their day, and prototyped a one-tap entry from the lock screen.',
          outcome: 'Logging frequency went up 41% in the first month after launch.',
        },
      },
      {
        id: 'p2',
        title: 'Budget planner',
        summary: 'A calmer way to plan monthly spending.',
        tags: ['Web', 'Finance'],
      },
      {
        id: 'p3',
        title: 'Design system',
        summary: 'Tokens, components and guidelines for four product teams.',
        tags: ['Systems'],
      },
    ],
    testimonials: [
      {
        id: 't1',
        quote:
          'Sam makes complex flows feel obvious, and brings engineering into the process early.',
        author: 'Alex Chen',
        role: 'Engineering Manager, Northbeam',
      },
    ],
  }),

  student: PortfolioContent.parse({
    profile: {
      name: 'Priya Shah',
      headline: 'Computer science student, graduating 2027',
      tagline: 'Looking for a software engineering internship for summer 2026.',
      bio: 'I study computer science and statistics, and I like building tools that help people learn.\n\nI lead the robotics club and tutor first-year programming students.',
      location: 'Austin, Texas',
      email: 'priya@example.com',
      socials: [{ label: 'GitHub', url: 'https://github.com/priyashah' }],
    },
    education: [
      {
        id: 'ed1',
        institution: 'University of Texas at Austin',
        degree: 'B.S. Computer Science, minor in Statistics',
        start: '2023',
        end: '2027',
        details: ['GPA 3.8', 'Coursework: Data Structures, Algorithms, Machine Learning'],
      },
    ],
    projects: [
      {
        id: 'p1',
        title: 'StudyBuddy',
        summary: 'Flashcard app with spaced repetition, used by 300 classmates.',
        tech: ['Flutter', 'Firebase'],
      },
      {
        id: 'p2',
        title: 'Line-following robot',
        summary: 'Club competition robot that placed 2nd at state.',
        tech: ['C++', 'Arduino'],
      },
    ],
    skills: [
      { group: 'Programming', items: ['Python', 'Java', 'Dart', 'C++'] },
      { group: 'Data', items: ['pandas', 'SQL', 'R'] },
    ],
    experience: [
      {
        id: 'e1',
        company: 'UT Austin',
        role: 'Teaching Assistant, Intro to Programming',
        start: '2024',
        end: 'Present',
        bullets: ['Run weekly lab sessions for 40 students.'],
      },
    ],
    awards: [{ id: 'a1', title: "Dean's List", issuer: 'UT Austin', date: '2024, 2025' }],
  }),

  professional: PortfolioContent.parse({
    profile: {
      name: 'Marcus Lee',
      headline: 'Operations leader for fast-growing logistics teams',
      tagline: 'I build teams and processes that scale without losing the customer.',
      bio: 'Twelve years running operations in e-commerce and logistics, most recently scaling a fulfilment network from two to nine sites.\n\nI am at my best turning a chaotic quarter into a calm, measurable plan.',
      location: 'Manchester, UK',
      email: 'marcus@example.com',
      socials: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/marcuslee' }],
    },
    experience: [
      {
        id: 'e1',
        company: 'Parcelwise',
        role: 'Director of Operations',
        start: '2020',
        end: 'Present',
        bullets: ['Opened 7 fulfilment sites in 3 years.', 'Cut late deliveries from 9% to 2%.'],
      },
      {
        id: 'e2',
        company: 'Homestore',
        role: 'Operations Manager',
        start: '2014',
        end: '2020',
        bullets: ['Managed a team of 120 across two warehouses.'],
      },
    ],
    skills: [
      { group: 'Leadership', items: ['Team building', 'Hiring', 'Change management'] },
      { group: 'Operations', items: ['Lean', 'Forecasting', 'Vendor management'] },
    ],
    testimonials: [
      {
        id: 't1',
        quote: 'Marcus brought order to our busiest year without ever losing the team.',
        author: 'Dana Fox',
        role: 'COO, Parcelwise',
      },
      {
        id: 't2',
        quote: 'The calmest person in any crisis room.',
        author: 'Lee Park',
        role: 'Head of Customer Service',
      },
    ],
    certifications: [{ id: 'c1', title: 'Lean Six Sigma Green Belt', issuer: 'BSI', date: '2019' }],
  }),
};

export function sampleState(profileType: ProfileType, presetId?: string): SiteState {
  return {
    content: SAMPLE_CONTENT[profileType],
    spec: defaultSpec(profileType, presetId),
    custom: { css: '', js: '', sections: {} },
    contactForm: { service: 'none', value: '' },
  };
}
