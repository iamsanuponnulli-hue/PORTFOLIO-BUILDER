import type { PortfolioContent } from '@pb/schema';

type Project = PortfolioContent['projects'][number];

export interface GithubProfile {
  name: string;
  bio: string;
  location: string;
  blog: string;
  htmlUrl: string;
}

export interface GithubImport {
  profile: GithubProfile;
  projects: Project[];
}

interface Repo {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
}

const API = 'https://api.github.com';

export class GithubError extends Error {}

async function getJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    throw new GithubError("Couldn't reach GitHub. Check your connection.");
  }
  if (res.status === 404) throw new GithubError('No GitHub user with that name.');
  if (res.status === 403 || res.status === 429)
    throw new GithubError('GitHub is limiting requests right now. Try again in an hour.');
  if (!res.ok) throw new GithubError(`GitHub answered with an error (${res.status}).`);
  return res.json() as Promise<T>;
}

/** First real paragraph of a README, without Markdown. */
export function readmeSummary(md: string): string {
  const paras = md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(#|!\[|\[!\[|<|\||-{3,}|={3,})/.test(p));
  const first = paras[0] ?? '';
  const plain = first
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 280 ? plain.slice(0, 277).replace(/\s+\S*$/, '') + '…' : plain;
}

const prettyName = (name: string) =>
  /[-_]/.test(name) && name === name.toLowerCase()
    ? name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : name;

/**
 * Imports a user's own (non-fork, non-archived) repositories, best first, called
 * directly from the browser. No AI: descriptions come from GitHub or the README.
 */
export async function importGithub(
  username: string,
  fetchImpl: typeof fetch = fetch,
  limit = 6,
): Promise<GithubImport> {
  const user = username
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/github\.com\//i, '')
    .split('/')[0]!;
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(user))
    throw new GithubError("That doesn't look like a GitHub username.");
  const u = await getJson<{
    name: string | null;
    bio: string | null;
    location: string | null;
    blog: string | null;
    html_url: string;
  }>(`${API}/users/${user}`, fetchImpl);
  const repos = await getJson<Repo[]>(
    `${API}/users/${user}/repos?per_page=100&type=owner&sort=pushed`,
    fetchImpl,
  );
  const picked = repos
    .filter(
      (r) =>
        !r.fork &&
        !r.archived &&
        r.name.toLowerCase() !== `${user.toLowerCase()}.github.io` &&
        r.name !== user,
    )
    .sort(
      (a, b) => b.stargazers_count - a.stargazers_count || b.pushed_at.localeCompare(a.pushed_at),
    )
    .slice(0, limit);

  const projects: Project[] = [];
  for (const r of picked) {
    let summary = r.description?.trim() ?? '';
    if (!summary) {
      try {
        const res = await fetchImpl(`${API}/repos/${user}/${r.name}/readme`, {
          headers: { Accept: 'application/vnd.github.raw+json' },
        });
        if (res.ok) summary = readmeSummary(await res.text());
      } catch {
        // A missing README just leaves the summary empty.
      }
    }
    const links = [{ label: 'GitHub', url: r.html_url }];
    if (r.homepage && /^https?:\/\//.test(r.homepage))
      links.push({ label: 'Live site', url: r.homepage });
    projects.push({
      id: `gh-${r.id}`,
      title: prettyName(r.name),
      summary,
      role: '',
      tech: r.language ? [r.language] : [],
      tags: (r.topics ?? []).slice(0, 5),
      links,
      images: [],
      featured: false,
    });
  }
  return {
    profile: {
      name: u.name ?? '',
      bio: u.bio ?? '',
      location: u.location ?? '',
      blog: u.blog ?? '',
      htmlUrl: u.html_url,
    },
    projects,
  };
}
