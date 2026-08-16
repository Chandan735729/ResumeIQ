/**
 * Skill Alias Map
 *
 * Purpose: deterministic, controlled alias resolution for the matching engine.
 *
 * Policy:
 *  - A canonical key is the lowercase normalized form of the "primary" name.
 *  - Aliases are other strings that mean the same skill.
 *  - Resolution is: normalize both sides → look up in map → match if canonical forms match.
 *  - No fuzzy/substring matching. Every alias must be explicitly enumerated here.
 *  - Aliases are case-insensitive (all stored lowercase, input normalized before lookup).
 *
 * Adding a new alias: add it to the canonical key's array. Document the reason if non-obvious.
 */

/** Map from canonical skill name → set of accepted aliases (all lowercase) */
export const SKILL_ALIAS_MAP: Record<string, string[]> = {
  // ── Languages ──────────────────────────────────────────────────────────────
  javascript: ['javascript', 'js', 'ecmascript', 'es6', 'es2015', 'es2016', 'es2017', 'es2018', 'es2019', 'es2020', 'es2021', 'es2022', 'es2023'],
  typescript: ['typescript', 'ts'],
  python: ['python', 'python3', 'python 3', 'py'],
  java: ['java', 'java se', 'java ee', 'java 8', 'java 11', 'java 17'],
  golang: ['go', 'golang', 'go lang'],
  rust: ['rust', 'rust lang', 'rustlang'],
  csharp: ['c#', 'csharp', 'c sharp', '.net c#', 'dotnet c#'],
  cplusplus: ['c++', 'cpp', 'cplusplus', 'c plus plus'],
  ruby: ['ruby', 'ruby on rails', 'rails'],
  php: ['php', 'php7', 'php8'],
  swift: ['swift', 'swift lang'],
  kotlin: ['kotlin'],
  scala: ['scala'],
  r: ['r language', 'r programming'],
  shell: ['bash', 'shell', 'sh', 'zsh', 'shell scripting', 'bash scripting'],
  sql: ['sql', 'structured query language'],

  // ── Frontend Frameworks ────────────────────────────────────────────────────
  react: ['react', 'reactjs', 'react.js', 'react js'],
  vue: ['vue', 'vuejs', 'vue.js', 'vue js', 'vue 3'],
  angular: ['angular', 'angularjs', 'angular.js', 'angular 2+', 'angular js'],
  svelte: ['svelte', 'sveltejs', 'svelte.js'],
  nextjs: ['next.js', 'nextjs', 'next js'],
  nuxt: ['nuxt', 'nuxt.js', 'nuxtjs'],
  gatsby: ['gatsby', 'gatsby.js'],
  redux: ['redux', 'redux toolkit', 'rtk'],

  // ── Backend Frameworks ─────────────────────────────────────────────────────
  nodejs: ['node.js', 'node', 'nodejs', 'node js'],
  express: ['express', 'expressjs', 'express.js'],
  fastapi: ['fastapi', 'fast api'],
  django: ['django'],
  flask: ['flask'],
  spring: ['spring', 'spring boot', 'spring framework'],
  laravel: ['laravel'],
  rails: ['rails', 'ruby on rails'],
  nestjs: ['nestjs', 'nest.js', 'nest js'],

  // ── Cloud Platforms ────────────────────────────────────────────────────────
  aws: ['aws', 'amazon web services', 'amazon aws', 'aws cloud'],
  gcp: ['gcp', 'google cloud', 'google cloud platform', 'google cloud services'],
  azure: ['azure', 'microsoft azure', 'azure cloud'],
  digitalocean: ['digitalocean', 'digital ocean'],
  heroku: ['heroku'],
  vercel: ['vercel'],
  netlify: ['netlify'],

  // ── AWS Services (common individual services) ──────────────────────────────
  'aws lambda': ['lambda', 'aws lambda'],
  's3': ['s3', 'aws s3', 'amazon s3'],
  'ec2': ['ec2', 'aws ec2', 'amazon ec2'],
  'rds': ['rds', 'aws rds', 'amazon rds'],
  'dynamodb': ['dynamodb', 'dynamo db', 'aws dynamodb'],

  // ── Databases ──────────────────────────────────────────────────────────────
  postgresql: ['postgresql', 'postgres', 'pg', 'psql'],
  mysql: ['mysql', 'my sql'],
  mongodb: ['mongodb', 'mongo', 'mongo db'],
  redis: ['redis'],
  elasticsearch: ['elasticsearch', 'elastic search', 'es'],
  cassandra: ['cassandra', 'apache cassandra'],
  sqlite: ['sqlite', 'sqlite3'],
  mariadb: ['mariadb', 'maria db'],
  neo4j: ['neo4j'],
  firebase: ['firebase', 'firebase firestore', 'firestore'],
  supabase: ['supabase'],

  // ── DevOps & Infrastructure ────────────────────────────────────────────────
  docker: ['docker', 'containerization', 'containers'],
  kubernetes: ['kubernetes', 'k8s'],
  terraform: ['terraform', 'tf'],
  ansible: ['ansible'],
  jenkins: ['jenkins'],
  'github actions': ['github actions', 'gh actions'],
  'gitlab ci': ['gitlab ci', 'gitlab ci/cd', 'gitlab pipelines'],
  'circleci': ['circleci', 'circle ci'],
  helm: ['helm', 'helm charts'],
  nginx: ['nginx', 'nginx server'],
  linux: ['linux', 'ubuntu', 'debian', 'centos', 'rhel', 'fedora'],

  // ── CI/CD (general) ───────────────────────────────────────────────────────
  cicd: ['ci/cd', 'cicd', 'ci cd', 'continuous integration', 'continuous deployment', 'continuous delivery'],

  // ── APIs & Protocols ──────────────────────────────────────────────────────
  'rest api': ['rest', 'restful', 'rest api', 'restful api', 'rest apis', 'restful apis', 'api', 'apis'],
  graphql: ['graphql', 'graph ql'],

  grpc: ['grpc', 'gpc', 'google rpc'],
  websocket: ['websocket', 'websockets', 'ws'],
  'oauth': ['oauth', 'oauth2', 'oauth 2.0'],
  jwt: ['jwt', 'json web token', 'json web tokens'],

  // ── Data & ML ─────────────────────────────────────────────────────────────
  'machine learning': ['machine learning', 'ml'],
  'deep learning': ['deep learning', 'dl'],
  'artificial intelligence': ['artificial intelligence', 'ai'],
  tensorflow: ['tensorflow', 'tf'],
  pytorch: ['pytorch', 'py torch'],
  pandas: ['pandas'],
  numpy: ['numpy'],
  spark: ['spark', 'apache spark', 'pyspark'],
  hadoop: ['hadoop', 'apache hadoop'],
  'data engineering': ['data engineering', 'data pipelines', 'etl', 'elt'],

  // ── Version Control ────────────────────────────────────────────────────────
  git: ['git', 'git version control'],
  github: ['github', 'git hub'],
  gitlab: ['gitlab', 'git lab'],
  bitbucket: ['bitbucket'],

  // ── Testing ───────────────────────────────────────────────────────────────
  jest: ['jest'],
  mocha: ['mocha'],
  pytest: ['pytest'],
  cypress: ['cypress'],
  playwright: ['playwright'],
  junit: ['junit', 'junit5'],
  'unit testing': ['unit testing', 'unit tests'],
  'integration testing': ['integration testing', 'integration tests'],
  'end to end testing': ['e2e testing', 'e2e tests', 'end to end testing', 'end-to-end testing'],

  // ── Architecture & Patterns ────────────────────────────────────────────────
  microservices: ['microservices', 'micro services', 'microservice architecture'],
  'system design': ['system design', 'distributed systems'],
  'agile': ['agile', 'scrum', 'kanban', 'agile methodology'],

  // ── Project Management & Soft Skills ──────────────────────────────────────
  'project management': ['project management', 'project planning'],
  leadership: ['leadership', 'team lead', 'technical lead', 'tech lead'],
  communication: ['communication', 'written communication', 'verbal communication'],
};

/**
 * Build a reverse lookup: alias → canonical key.
 * Pre-computed at module load for O(1) matching.
 */
const ALIAS_TO_CANONICAL = new Map<string, string>();

for (const [canonical, aliases] of Object.entries(SKILL_ALIAS_MAP)) {
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
  }
}

/**
 * Normalize a skill string for comparison.
 * - Lowercase
 * - Collapse whitespace
 * - Strip leading/trailing whitespace
 */
export function normalizeSkill(skill: string): string {
  return skill.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Return the canonical key for a skill, or the normalized input itself if unknown.
 */
export function resolveCanonical(skill: string): string {
  const normalized = normalizeSkill(skill);
  return ALIAS_TO_CANONICAL.get(normalized) ?? normalized;
}

/**
 * Check if two skills are equivalent under the alias map.
 * Returns true if both resolve to the same canonical key.
 */
export function areSkillsEquivalent(a: string, b: string): boolean {
  return resolveCanonical(a) === resolveCanonical(b);
}

/**
 * Given a list of resume skills and a required skill, determine if the
 * required skill is present (directly or via alias).
 *
 * Returns the matching resume skill string, or null if not found.
 */
export function findSkillMatch(
  resumeSkills: string[],
  requiredSkill: string,
): string | null {
  const requiredCanonical = resolveCanonical(requiredSkill);
  for (const resumeSkill of resumeSkills) {
    if (resolveCanonical(resumeSkill) === requiredCanonical) {
      return resumeSkill;
    }
  }
  return null;
}

/**
 * Check if a skill appears anywhere in a block of raw text (case-insensitive, word-boundary aware).
 * Used for context/partial matching when the skill isn't in the skills section.
 */
export function skillMentionedInText(skill: string, text: string): boolean {
  const normalized = normalizeSkill(skill);
  const normalizedText = text.toLowerCase();
  // Require word-boundary-like context to avoid "go" matching "algorithm", etc.
  const pattern = new RegExp(
    `(?:^|[\\s,;:(\\[{/"'])${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,;:)\\]}/."'])`,
  );
  return pattern.test(normalizedText);
}
