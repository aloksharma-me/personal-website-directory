/* Site model: turns SITES_DATA into searchable records, and defines filtering and sorting.
   No DOM access here, so it stays easy to test or reuse. */

// Free hosting platforms, grouped together under the "Free hosts" filter.
const FREE_HOSTS = [
  'vercel.app', 'github.io', 'framer.website', 'framer.wiki', 'netlify.app', 'pages.dev',
  'webflow.io', 'lovable.app', 'wordpress.com', 'blogspot.com', 'neocities.org', 'is-a.dev',
  'vzy.io', 'pxxl.click'
];

// Placeholder preview colours; each site gets a stable one based on its domain.
const PREVIEW_COLOURS = [
  '#C9B8A8', '#A9B8A0', '#9FB3C8', '#D4B5B0', '#C8C1A0', '#B5AEC9',
  '#A7C4BC', '#D9C9A3', '#BFB3A6', '#9DA9A0', '#C4A99A', '#AEBBC4'
];

// [id, label]. "other" matches every kind that doesn't have its own filter.
const FILTERS = [
  ['all', 'All'],
  ['.com', '.com'],
  ['.dev', '.dev'],
  ['.xyz', '.xyz'],
  ['.me', '.me'],
  ['.design', '.design'],
  ['hosted', 'Free hosts'],
  ['other', 'Other']
];

const NAMED_KINDS = new Set(['.com', '.dev', '.xyz', '.me', '.design', 'hosted']);

// FNV-1a: a small, stable string hash (same input → same number, every time).
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// "hosted" for free-host subdomains, otherwise the top-level domain, e.g. ".com".
function kindOf(site) {
  const host = site.split('/')[0];
  const isHosted = FREE_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  if (isHosted) return 'hosted';
  const parts = host.split('.');
  return '.' + parts[parts.length - 1];
}

const SITES = SITES_DATA.map((entry) => {
  const h = hash(entry.site);
  return {
    ...entry,
    url: 'https://' + entry.site,
    kind: kindOf(entry.site),
    colour: PREVIEW_COLOURS[h % PREVIEW_COLOURS.length],
    searchText: `${entry.name} ${entry.site} ${entry.handle}`.toLowerCase()
  };
});

function matchesFilter(site, filterId) {
  if (filterId === 'all') return true;
  if (filterId === 'other') return !NAMED_KINDS.has(site.kind);
  return site.kind === filterId;
}

function countForFilter(filterId) {
  return SITES.filter((site) => matchesFilter(site, filterId)).length;
}

// seed 0 → alphabetical by name; any other seed → a repeatable shuffle.
function querySites({ query, filter, seed }) {
  const q = query.trim().toLowerCase();
  const list = SITES.filter((site) =>
    matchesFilter(site, filter) && (!q || site.searchText.includes(q))
  );

  if (seed) {
    return list.sort((a, b) => hash(a.site + seed) - hash(b.site + seed));
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
