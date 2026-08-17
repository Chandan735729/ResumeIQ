/**
 * Change Tracking & Diff Engine
 *
 * Generates machine-readable diffs and applies validated changes to produce
 * updated resume text and layout for deterministic re-scoring.
 */

import type { ValidatedChange } from './guardrails/factGuardrail';
import type { ResumeMatchInput } from '../matchingEngine.service';

export interface ChangeDiffItem {
  id: string;
  section: 'experience' | 'skills' | 'summary' | 'projects';
  originalText: string;
  suggestedText: string;
  reason: string;
  evidence: string[];
  isApplied: boolean;
  rejectionReason?: string;
}

export interface OptimizationDiffReport {
  totalChangesProposed: number;
  totalChangesApplied: number;
  totalChangesRejected: number;
  changes: ChangeDiffItem[];
  originalText: string;
  optimizedText: string;
  optimizedLayout: ResumeMatchInput;
  summarySuggestion?: string;
}

/**
 * Apply approved changes to the original raw text and structured resume layout
 */
export function applyChangesToResume(
  originalResume: ResumeMatchInput,
  approvedChanges: ValidatedChange[],
  rejectedChanges: ValidatedChange[] = [],
  summarySuggestion?: string
): OptimizationDiffReport {
  let updatedRawText = originalResume.rawText;
  const updatedSkills = [...originalResume.skills];
  const updatedExperience = originalResume.experience.map(exp => ({
    ...exp,
    bullets: [...exp.bullets],
  }));
  const updatedProjectTechnologies = [...originalResume.projectTechnologies];
  const updatedProjectItems = (originalResume.projects ?? []).map(p => ({ ...p }));
  let updatedSummary = originalResume.summary;

  const changeDiffs: ChangeDiffItem[] = [];

  // Track approved changes
  approvedChanges.forEach((change, index) => {
    const diffId = `change-${index + 1}`;
    let applied = false;

    // Apply to rawText replacement
    if (updatedRawText.includes(change.original)) {
      updatedRawText = updatedRawText.replace(change.original, change.suggested);
      applied = true;
    } else {
      // If exact substring not found in rawText, append replacement
      updatedRawText += `\n${change.suggested}`;
      applied = true;
    }

    // Apply to structured layout
    if (change.section === 'experience') {
      for (const exp of updatedExperience) {
        for (let bIdx = 0; bIdx < exp.bullets.length; bIdx++) {
          if (exp.bullets[bIdx].includes(change.original)) {
            exp.bullets[bIdx] = exp.bullets[bIdx].replace(change.original, change.suggested);
            break;
          }
        }
      }
    } else if (change.section === 'skills') {
      // If skills section change, add new explicitly approved phrasing
      if (!updatedSkills.includes(change.suggested)) {
        updatedSkills.push(change.suggested);
      }
    } else if (change.section === 'summary') {
      if (updatedSummary && updatedSummary.includes(change.original)) {
        updatedSummary = updatedSummary.replace(change.original, change.suggested);
      } else if (updatedSummary) {
        updatedSummary = `${updatedSummary}\n${change.suggested}`;
      } else {
        updatedSummary = change.suggested;
      }
    } else if (change.section === 'projects') {
      for (const proj of updatedProjectItems) {
        if (proj.description && proj.description.includes(change.original)) {
          proj.description = proj.description.replace(change.original, change.suggested);
          break;
        }
      }
    }

    changeDiffs.push({
      id: diffId,
      section: change.section,
      originalText: change.original,
      suggestedText: change.suggested,
      reason: change.reason,
      evidence: change.evidence,
      isApplied: applied,
    });
  });

  // Track rejected changes
  rejectedChanges.forEach((change, index) => {
    changeDiffs.push({
      id: `rejected-${index + 1}`,
      section: change.section,
      originalText: change.original,
      suggestedText: change.suggested,
      reason: change.reason,
      evidence: change.evidence,
      isApplied: false,
      rejectionReason: change.rejectionReason,
    });
  });

  if (summarySuggestion && summarySuggestion.trim().length > 0) {
    updatedRawText = `${summarySuggestion.trim()}\n\n${updatedRawText}`;
    updatedSummary = summarySuggestion.trim();
  }

  const optimizedLayout: ResumeMatchInput = {
    skills: updatedSkills,
    experience: updatedExperience,
    education: originalResume.education,
    certifications: originalResume.certifications,
    projectTechnologies: updatedProjectTechnologies,
    rawText: updatedRawText,
    contact: originalResume.contact,
    summary: updatedSummary,
    projects: updatedProjectItems,
    languages: originalResume.languages,
    sectionOrder: originalResume.sectionOrder,
  };

  return {
    totalChangesProposed: approvedChanges.length + rejectedChanges.length,
    totalChangesApplied: approvedChanges.length,
    totalChangesRejected: rejectedChanges.length,
    changes: changeDiffs,
    originalText: originalResume.rawText,
    optimizedText: updatedRawText,
    optimizedLayout,
    summarySuggestion,
  };
}
