/* eslint-disable no-console */
/**
 * Real-Data Export QA Sweep (manual dev tool, NOT part of CI)
 *
 * Runs the full parse -> optimize (3 modes) -> generate PDF/DOCX -> reopen/
 * reparse -> content-preservation -> ATS-score pipeline against every real
 * fixture resume in the repo (backend/tests/fixtures/**), using the REAL
 * parser and the REAL export pipeline (mock AI provider only, since this
 * environment has no live Gemini key).
 *
 * Output (JSON + Markdown report, plus generated PDF/DOCX for a few
 * representative fixtures for visual inspection) is written ONLY to an
 * output directory outside the repo -- never committed, since it contains
 * real people's resume content re-rendered through our own templates.
 *
 * Usage: npx ts-node -T tests/scripts/exportRealDataQA.ts <output-dir>
 */
import fs from 'fs';
import path from 'path';
import { parseResume } from '../../src/services/resumeParser.service';
import { layoutToMatchInput, matchResumeToJob } from '../../src/services/matchingEngine.service';
import { computeATSScore } from '../../src/services/atsScorer.service';
import { extractJobDescription } from '../../src/services/jdExtractor.service';
import { buildOptimizationPrompt, CURRENT_PROMPT_VERSION } from '../../src/services/ai/prompts/optimization.prompts';
import { MockAIProvider } from '../../src/services/ai/mockAIProvider';
import { validateOptimizationSchema } from '../../src/services/ai/guardrails/schemaValidator';
import { runFactGuardrails, wordDriftRatio } from '../../src/services/ai/guardrails/factGuardrail';
import { applyChangesToResume } from '../../src/services/ai/changeTracker';
import { rescoreOptimizedResume } from '../../src/services/ai/rescorer.service';
import { documentGenerationService } from '../../src/services/documents/documentGeneration.service';
import { verifyContentPreserved } from '../../src/services/documents/contentPreservation';
import { sanitizeResumeForRender } from '../../src/services/documents/textSanitizer';
import type { OptimizationType } from '../../src/modules/optimization/optimization.types';

const JD_TEXT = `We are hiring a Software Engineer. Required skills: Python, JavaScript, SQL, Git, communication,
problem solving, project management, data analysis, teamwork, leadership. 3+ years of experience preferred.
Bachelor's degree in Computer Science or related field.`;

const FIXTURE_DIRS = [
  path.join(__dirname, '..', 'fixtures', 'real-world-resumes'),
  path.join(__dirname, '..', 'fixtures', 'resumes'),
];

// Save generated PDF/DOCX only for these (by fixture basename) so the QA
// artifact directory doesn't balloon; the report itself still covers all fixtures.
const SAVE_ARTIFACTS_FOR = new Set([
  'multi-page-resume.pdf',
  'multi-column-resume.pdf',
  'fau-engineering-resume.pdf',
  'technical-resume.docx',
  'academic-resume.docx',
]);

const MODES: OptimizationType[] = ['conservative', 'ats_focused', 'recruiter_focused'];

interface ModeResult {
  mode: OptimizationType;
  beforeScore: number;
  afterScore: number;
  scoreDelta: number;
  changesProposed: number;
  changesApplied: number;
  changesRejected: number;
  rejectionReasons: string[];
  avgWordDrift: number;
  pdf: { ok: boolean; error?: string; missing?: string[]; sizeBytes?: number; pageCount?: number };
  docx: { ok: boolean; error?: string; missing?: string[]; sizeBytes?: number };
}

interface FixtureResult {
  fileName: string;
  fileType: string;
  parseConfidence: number;
  sections: number;
  skills: number;
  experience: number;
  education: number;
  projects: number;
  certifications: number;
  languages: number;
  parseError?: string;
  modes: ModeResult[];
  overallPass: boolean;
}

async function runFixture(filePath: string): Promise<FixtureResult> {
  const fileName = path.basename(filePath);
  const buffer = fs.readFileSync(filePath);

  let parsed;
  try {
    parsed = await parseResume(buffer, fileName);
  } catch (err: any) {
    return {
      fileName,
      fileType: path.extname(fileName).replace('.', ''),
      parseConfidence: 0,
      sections: 0,
      skills: 0,
      experience: 0,
      education: 0,
      projects: 0,
      certifications: 0,
      languages: 0,
      parseError: err?.message || String(err),
      modes: [],
      overallPass: false,
    };
  }

  const extractedLayout = JSON.stringify({
    contact: parsed.contact,
    summary: parsed.summary,
    skills: parsed.skills,
    experience: parsed.experience,
    education: parsed.education,
    projects: parsed.projects,
    certifications: parsed.certifications,
    languages: parsed.languages,
    sections: parsed.sections,
  });

  const resumeInput = layoutToMatchInput(extractedLayout, parsed.rawText)!;
  const structuredJD = extractJobDescription(JD_TEXT, 'Software Engineer');
  const beforeMatch = matchResumeToJob(resumeInput, structuredJD);
  const beforeScoreResult = computeATSScore(beforeMatch);

  const provider = new MockAIProvider('success_standard');
  const modeResults: ModeResult[] = [];

  for (const mode of MODES) {
    const promptContext = buildOptimizationPrompt(parsed.rawText, JD_TEXT, beforeMatch, CURRENT_PROMPT_VERSION, mode);
    const aiResponse = await provider.generateOptimization(promptContext, {});
    const schemaValidation = validateOptimizationSchema(aiResponse.rawContent);

    if (!schemaValidation.isValid || !schemaValidation.data) {
      modeResults.push({
        mode,
        beforeScore: beforeScoreResult.overallScore,
        afterScore: beforeScoreResult.overallScore,
        scoreDelta: 0,
        changesProposed: 0,
        changesApplied: 0,
        changesRejected: 0,
        rejectionReasons: ['SCHEMA_VALIDATION_FAILED'],
        avgWordDrift: 0,
        pdf: { ok: false, error: 'schema validation failed' },
        docx: { ok: false, error: 'schema validation failed' },
      });
      continue;
    }

    const factReport = runFactGuardrails(schemaValidation.data.changes, resumeInput.rawText, resumeInput.skills, mode);
    const diffReport = applyChangesToResume(resumeInput, factReport.approvedChanges, factReport.rejectedChanges, schemaValidation.data.summarySuggestion);
    const scoreComparison = rescoreOptimizedResume(diffReport.optimizedLayout, structuredJD, beforeScoreResult);

    const appliedChanges = diffReport.changes.filter(c => c.isApplied);
    const avgWordDrift = appliedChanges.length > 0
      ? appliedChanges.reduce((sum, c) => sum + wordDriftRatio(c.originalText, c.suggestedText), 0) / appliedChanges.length
      : 0;

    const result: ModeResult = {
      mode,
      beforeScore: scoreComparison.beforeScore,
      afterScore: scoreComparison.afterScore,
      scoreDelta: scoreComparison.afterScore - scoreComparison.beforeScore,
      changesProposed: diffReport.totalChangesProposed,
      changesApplied: diffReport.totalChangesApplied,
      changesRejected: diffReport.totalChangesRejected,
      rejectionReasons: factReport.rejectedChanges.map(c => c.rejectionReason || 'unknown').filter((v, i, a) => a.indexOf(v) === i),
      avgWordDrift,
      pdf: { ok: false },
      docx: { ok: false },
    };

    // PDF
    try {
      const pdfDoc = await documentGenerationService.generateDocumentBuffer(diffReport.optimizedLayout, {
        format: 'pdf',
        candidateName: diffReport.optimizedLayout.contact?.fullName,
        summary: diffReport.summarySuggestion,
      });
      result.pdf = { ok: true, sizeBytes: pdfDoc.fileSizeBytes, pageCount: pdfDoc.pageCount };
      if (SAVE_ARTIFACTS_FOR.has(fileName)) {
        const outDir = process.argv[2];
        if (outDir) {
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(path.join(outDir, `${fileName}.${mode}.pdf`), pdfDoc.buffer);
        }
      }
    } catch (err: any) {
      const sanitized = sanitizeResumeForRender(diffReport.optimizedLayout);
      result.pdf = { ok: false, error: err?.message || String(err), missing: verifyContentPreserved(sanitized, '').missing };
    }

    // DOCX
    try {
      const docxDoc = await documentGenerationService.generateDocumentBuffer(diffReport.optimizedLayout, {
        format: 'docx',
        candidateName: diffReport.optimizedLayout.contact?.fullName,
        summary: diffReport.summarySuggestion,
      });
      result.docx = { ok: true, sizeBytes: docxDoc.fileSizeBytes };
      if (SAVE_ARTIFACTS_FOR.has(fileName)) {
        const outDir = process.argv[2];
        if (outDir) {
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(path.join(outDir, `${fileName}.${mode}.docx`), docxDoc.buffer);
        }
      }
    } catch (err: any) {
      result.docx = { ok: false, error: err?.message || String(err) };
    }

    modeResults.push(result);
  }

  const overallPass = modeResults.every(m => m.pdf.ok && m.docx.ok);

  return {
    fileName,
    fileType: path.extname(fileName).replace('.', ''),
    parseConfidence: parsed.parseConfidence,
    sections: parsed.sections.length,
    skills: parsed.skills.length,
    experience: parsed.experience.length,
    education: parsed.education.length,
    projects: parsed.projects.length,
    certifications: parsed.certifications.length,
    languages: parsed.languages.length,
    modes: modeResults,
    overallPass,
  };
}

async function main() {
  const outDir = process.argv[2];
  const files: string[] = [];
  for (const dir of FIXTURE_DIRS) {
    for (const f of fs.readdirSync(dir)) {
      if (/\.(pdf|docx)$/i.test(f)) files.push(path.join(dir, f));
    }
  }

  const results: FixtureResult[] = [];
  for (const filePath of files) {
    console.log(`Processing ${path.basename(filePath)}...`);
    const result = await runFixture(filePath);
    results.push(result);
  }

  const overallPass = results.every(r => r.overallPass);

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ overallPass, results }, null, 2));
    fs.writeFileSync(path.join(outDir, 'report.md'), renderMarkdown(results, overallPass));
  }

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(`${r.overallPass ? 'PASS' : 'FAIL'}  ${r.fileName}  (sections=${r.sections} skills=${r.skills} exp=${r.experience} edu=${r.education} proj=${r.projects} cert=${r.certifications} lang=${r.languages})`);
    if (r.parseError) console.log(`  PARSE ERROR: ${r.parseError}`);
    for (const m of r.modes) {
      const status = m.pdf.ok && m.docx.ok ? 'ok' : 'FAIL';
      console.log(`  [${m.mode}] ${status}  score ${m.beforeScore.toFixed(1)} -> ${m.afterScore.toFixed(1)} (${m.scoreDelta >= 0 ? '+' : ''}${m.scoreDelta.toFixed(1)})  applied=${m.changesApplied}/${m.changesProposed} drift=${m.avgWordDrift.toFixed(2)}  pdf=${m.pdf.ok ? 'ok' : m.pdf.error} docx=${m.docx.ok ? 'ok' : m.docx.error}`);
    }
  }
  console.log(`\nOVERALL: ${overallPass ? 'PASS' : 'FAIL'}`);
  if (outDir) console.log(`Report written to ${outDir}`);

  process.exit(overallPass ? 0 : 1);
}

function renderMarkdown(results: FixtureResult[], overallPass: boolean): string {
  const lines: string[] = [];
  lines.push('# Real-Data Export QA Report');
  lines.push('');
  lines.push(`Overall: **${overallPass ? 'PASS' : 'FAIL'}**`);
  lines.push('');
  for (const r of results) {
    lines.push(`## ${r.fileName}`);
    lines.push('');
    lines.push(`- Type: ${r.fileType}, parse confidence: ${r.parseConfidence}`);
    lines.push(`- Sections extracted: ${r.sections}, skills: ${r.skills}, experience: ${r.experience}, education: ${r.education}, projects: ${r.projects}, certifications: ${r.certifications}, languages: ${r.languages}`);
    if (r.parseError) {
      lines.push(`- **PARSE ERROR**: ${r.parseError}`);
    }
    lines.push('');
    lines.push('| Mode | ATS Before | ATS After | Delta | Applied/Proposed | Avg Drift | PDF | DOCX |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const m of r.modes) {
      lines.push(`| ${m.mode} | ${m.beforeScore.toFixed(1)} | ${m.afterScore.toFixed(1)} | ${m.scoreDelta.toFixed(1)} | ${m.changesApplied}/${m.changesProposed} | ${m.avgWordDrift.toFixed(2)} | ${m.pdf.ok ? 'OK' : 'FAIL: ' + m.pdf.error} | ${m.docx.ok ? 'OK' : 'FAIL: ' + m.docx.error} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

main().catch(e => { console.error(e); process.exit(1); });
