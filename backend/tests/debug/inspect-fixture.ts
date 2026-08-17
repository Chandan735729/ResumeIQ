/* eslint-disable no-console */
/**
 * Developer-only resume parser inspection tool. Not wired into the app or CI.
 *
 * Runs the real parser directly against a file (no HTTP, no DB, no auth) and
 * prints structured diagnostics: what the extractor saw, which sections were
 * detected and with what confidence, and the extracted fields.
 *
 * Redacts personally-identifying content (contact info, section body text,
 * raw text) by default. Pass --show-content for full local debugging output;
 * never commit or share --show-content output for a real person's resume.
 *
 * Usage: npm run inspect:resume -- <path-to-file> [--show-content]
 */
import fs from 'fs';
import path from 'path';
import { parseResume } from '../../src/services/resumeParser.service';

async function main() {
  const target = process.argv[2];
  const showContent = process.argv.includes('--show-content');
  if (!target) {
    console.error('Usage: npm run inspect:resume -- <file> [--show-content]');
    process.exit(1);
  }

  const filePath = path.resolve(target);
  const buffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  console.log('=== FILE ===');
  console.log({ fileName, sizeBytes: buffer.length });

  try {
    const parsed = await parseResume(buffer, fileName);

    console.log('\n=== EXTRACTION ===');
    console.log({
      sourceType: parsed.sourceType,
      pageCount: parsed.metadata.pageCount,
      hasMultipleColumns: parsed.metadata.hasMultipleColumns,
      hasTables: parsed.metadata.hasTables,
      extractedTextLength: parsed.rawText.length,
      layoutNotes: parsed.metadata.layoutNotes,
    });

    console.log('\n=== CONTACT ===');
    console.log({
      hasFullName: Boolean(parsed.contact.fullName),
      hasEmail: Boolean(parsed.contact.email),
      hasPhone: Boolean(parsed.contact.phone),
      hasLocation: Boolean(parsed.contact.location),
      hasLinkedIn: Boolean(parsed.contact.linkedin),
      hasGithub: Boolean(parsed.contact.github),
      ...(showContent ? { value: parsed.contact } : {}),
    });

    console.log('\n=== DETECTED SECTIONS ===');
    for (const s of parsed.sections) {
      console.log({
        title: showContent ? s.title : '[redacted]',
        type: s.type,
        confidence: s.confidence,
        startLine: s.startLine,
        endLine: s.endLine,
        textLength: s.normalizedText.length,
        preview: showContent ? s.normalizedText.slice(0, 200) : '[redacted]',
      });
    }

    console.log('\n=== TECHNICAL SKILLS ===', parsed.skills.length);
    console.log(showContent ? parsed.skills : parsed.skills.slice(0, 5).concat(parsed.skills.length > 5 ? ['...redacted'] : []));

    console.log('\n=== LANGUAGES ===', parsed.languages.length);
    console.log(showContent ? parsed.languages : parsed.languages.map(() => '[redacted]'));

    console.log('\n=== EXPERIENCE COUNT ===', parsed.experience.length);
    console.log('=== EDUCATION COUNT ===', parsed.education.length);
    console.log('=== PROJECTS COUNT ===', parsed.projects.length);
    console.log('=== CERTIFICATIONS COUNT ===', parsed.certifications.length);

    console.log('\n=== WARNINGS ===');
    console.log(parsed.warnings);

    console.log('\n=== CONFIDENCE ===', parsed.parseConfidence);
    console.log('=== RESUME TYPE ===', parsed.resumeType);

    if (showContent) {
      console.log('\n=== RAW TEXT (FULL) ===');
      console.log(parsed.rawText);
    }
  } catch (error: any) {
    console.error('\n=== PARSE FAILED ===');
    console.error({
      message: error.message,
      code: error.code,
      ...(showContent ? { stack: error.stack } : {}),
    });
    process.exitCode = 1;
  }
}

main();
