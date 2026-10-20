import { validateInformationCapture, type InformationCapture } from '../vereinsflieger/information';

/** Source text only; no date normalization, eligibility or validity classification. */
export function medicalSource(captures: readonly InformationCapture[], owner: string): InformationCapture | null {
  const candidates = captures.filter(c => c.category === 'medical' && c.owner === owner);
  if (candidates.length !== 1) return null;
  try { return validateInformationCapture(candidates[0]); } catch { return null; }
}
