import { parseResume } from '@services/resumeParser.service';
import { createPdfBuffer } from '../helpers/documentFactories';

/**
 * Regression coverage for the real-world bug report: a resume with a genuine
 * TECHNICAL SKILLS section and a genuine (spoken) LANGUAGES section came back
 * with extractedSkills = 0 and an empty languages array. None of the fixtures
 * in tests/fixtures/{resumes,real-world-resumes} exercised a spoken-language
 * section at all (see docs/PHASE_REPORTS/REAL_WORLD_PARSER_AUDIT.md), so this
 * gap could — and did — ship undetected. These tests reproduce the reported
 * shape directly and must fail on the pre-fix implementation.
 */
describe('Real-world regression: TECHNICAL SKILLS + LANGUAGES extraction', () => {
  it('extracts categorized technical skills and spoken languages with proficiency from an uppercase-heading resume', async () => {
    const buffer = await createPdfBuffer([
      [
        'Jordan Rivera',
        'jordan.rivera@example.com | +1 555-0142 | Seattle, WA',
        '',
        'SUMMARY',
        'Full-stack engineer with 6 years building distributed systems and developer tooling.',
        '',
        'TECHNICAL SKILLS',
        'Languages: Python, Go, TypeScript',
        'Frameworks: React, FastAPI, Express',
        'Databases: PostgreSQL, Redis',
        'Cloud & Infrastructure',
        'AWS: ECS, Lambda, S3',
        '',
        'EXPERIENCE',
        'Senior Software Engineer | Meridian Systems | Jan 2021 - Present',
        'Led migration of a monolith to microservices, cutting deploy time 40%.',
        '',
        'EDUCATION',
        'B.S. Computer Science | University of Washington | 2018',
        '',
        'LANGUAGES',
        'English - Native',
        'Spanish: Fluent',
        'Mandarin (Conversational)',
      ],
    ]);

    const parsed = await parseResume(buffer, 'jordan-rivera-resume.pdf');

    // --- Technical skills: must not be empty, must reflect categorized content ---
    expect(parsed.skills.length).toBeGreaterThan(0);
    const skillsLower = parsed.skills.map((s) => s.toLowerCase());
    for (const expected of ['python', 'go', 'typescript', 'react', 'fastapi', 'express', 'postgresql', 'redis']) {
      expect(skillsLower).toContainEqual(expect.stringMatching(new RegExp(`^${expected}$`, 'i')));
    }
    // Category labels themselves must not appear as skills.
    expect(skillsLower).not.toContain('languages');
    expect(skillsLower).not.toContain('frameworks');
    expect(skillsLower).not.toContain('databases');
    expect(skillsLower).not.toContain('cloud & infrastructure');

    // --- Spoken languages: must not be empty, must carry proficiency ---
    expect(parsed.languages.length).toBeGreaterThan(0);
    const byName = Object.fromEntries(parsed.languages.map((l) => [l.name.toLowerCase(), l.proficiency]));
    expect(byName['english']).toMatch(/native/i);
    expect(byName['spanish']).toMatch(/fluent/i);
    expect(byName['mandarin']).toMatch(/conversational/i);

    // --- Programming vs spoken language distinction ---
    const languageNamesLower = parsed.languages.map((l) => l.name.toLowerCase());
    for (const programmingLang of ['python', 'go', 'typescript']) {
      expect(languageNamesLower).not.toContain(programmingLang);
    }
    for (const spokenLang of ['english', 'spanish', 'mandarin']) {
      expect(skillsLower).not.toContain(spokenLang);
    }
  });

  it('extracts skills that share a line with the section heading', async () => {
    const buffer = await createPdfBuffer([
      [
        'Taylor Brooks',
        'taylor.brooks@example.com',
        '',
        'SKILLS Python, Go, Rust',
        '',
        'EXPERIENCE',
        'Software Engineer | Acme Corp | 2020 - Present',
        'Built internal tooling used by the platform team.',
      ],
    ]);

    const parsed = await parseResume(buffer, 'taylor-brooks-resume.pdf');

    const skillsLower = parsed.skills.map((s) => s.toLowerCase());
    expect(skillsLower).toEqual(expect.arrayContaining(['python', 'go', 'rust']));

    const skillsSection = parsed.sections.find((s) => s.type === 'skills');
    expect(skillsSection?.title.toLowerCase()).toBe('skills');
  });

  it('does not fragment experience content on a body sentence starting with a section keyword', async () => {
    const buffer = await createPdfBuffer([
      [
        'Morgan Lee',
        'morgan.lee@example.com',
        '',
        'EXPERIENCE',
        'Software Engineer | Globex | 2019 - Present',
        'Delivered several major features. Experience with distributed systems is possible on this team.',
        '',
        'SKILLS',
        'Java, Kotlin, Docker',
      ],
    ]);

    const parsed = await parseResume(buffer, 'morgan-lee-resume.pdf');

    const experienceSections = parsed.sections.filter((s) => s.type === 'experience');
    expect(experienceSections.length).toBe(1);
  });
});
