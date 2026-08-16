/**
 * Schema Validation Guardrail for AI Optimization Output
 *
 * Validates that the raw LLM response parses to valid JSON conforming
 * to the exact required schema.
 */

export interface RawOptimizationChange {
  section: 'experience' | 'skills' | 'summary' | 'projects';
  itemId?: string;
  original: string;
  suggested: string;
  reason: string;
  evidence: string[];
}

export interface RawOptimizationOutput {
  summarySuggestion?: string;
  changes: RawOptimizationChange[];
  preservedFacts?: string[];
  warnings?: string[];
}

export interface SchemaValidationResult {
  isValid: boolean;
  data: RawOptimizationOutput | null;
  errors: string[];
}

const ALLOWED_SECTIONS = new Set(['experience', 'skills', 'summary', 'projects']);
const MAX_CHANGES_COUNT = 30;
const MAX_SUGGESTION_LENGTH = 1500;

export function cleanJsonText(raw: string): string {
  let cleaned = raw.trim();
  // Remove markdown code fences if LLM wrapped output in ```json ... ```
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

export function validateOptimizationSchema(rawOutput: string): SchemaValidationResult {
  const errors: string[] = [];

  if (!rawOutput || rawOutput.trim().length === 0) {
    return { isValid: false, data: null, errors: ['AI output is empty.'] };
  }

  const cleaned = cleanJsonText(rawOutput);
  let parsed: any;

  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    return {
      isValid: false,
      data: null,
      errors: [`Failed to parse AI output as JSON: ${err.message || 'SyntaxError'}`],
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { isValid: false, data: null, errors: ['AI output must be a JSON object.'] };
  }

  // Validate changes array
  if (!Array.isArray(parsed.changes)) {
    errors.push('Field "changes" must be an array.');
  } else {
    if (parsed.changes.length > MAX_CHANGES_COUNT) {
      errors.push(`Changes array exceeds maximum allowed count of ${MAX_CHANGES_COUNT}.`);
    }

    parsed.changes.forEach((change: any, index: number) => {
      if (typeof change !== 'object' || change === null) {
        errors.push(`Change item at index ${index} must be an object.`);
        return;
      }

      if (!ALLOWED_SECTIONS.has(change.section)) {
        errors.push(
          `Change at index ${index} has invalid section "${change.section}". Must be one of: ${Array.from(ALLOWED_SECTIONS).join(', ')}.`
        );
      }

      if (typeof change.original !== 'string' || change.original.trim().length === 0) {
        errors.push(`Change at index ${index} missing required "original" string.`);
      }

      if (typeof change.suggested !== 'string' || change.suggested.trim().length === 0) {
        errors.push(`Change at index ${index} missing required "suggested" string.`);
      } else if (change.suggested.length > MAX_SUGGESTION_LENGTH) {
        errors.push(`Change at index ${index} suggested text exceeds ${MAX_SUGGESTION_LENGTH} characters.`);
      }

      if (typeof change.reason !== 'string' || change.reason.trim().length === 0) {
        errors.push(`Change at index ${index} missing required "reason" explanation.`);
      }

      if (change.evidence && !Array.isArray(change.evidence)) {
        errors.push(`Change at index ${index} "evidence" must be an array of strings.`);
      }
    });
  }

  // Validate optional summarySuggestion
  if (parsed.summarySuggestion !== undefined && typeof parsed.summarySuggestion !== 'string') {
    errors.push('Field "summarySuggestion" must be a string if provided.');
  }

  if (errors.length > 0) {
    return { isValid: false, data: null, errors };
  }

  const sanitizedData: RawOptimizationOutput = {
    summarySuggestion: parsed.summarySuggestion?.trim(),
    changes: parsed.changes.map((c: any) => ({
      section: c.section,
      itemId: c.itemId ? String(c.itemId) : undefined,
      original: c.original.trim(),
      suggested: c.suggested.trim(),
      reason: c.reason.trim(),
      evidence: Array.isArray(c.evidence) ? c.evidence.map((e: any) => String(e).trim()) : [],
    })),
    preservedFacts: Array.isArray(parsed.preservedFacts)
      ? parsed.preservedFacts.map((f: any) => String(f).trim())
      : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((w: any) => String(w).trim()) : [],
  };

  return { isValid: true, data: sanitizedData, errors: [] };
}
