export type CoreFlightRetrievalPhase = 'idle' | 'loading' | 'saving';

export interface CoreFlightReviewAdmission {
  nonce: string;
  generation: number;
  previousCaptureId: string | null;
}

export function canCancelCoreFlightSource(phase: CoreFlightRetrievalPhase, saving: boolean, restoring: boolean): boolean {
  return phase !== 'saving' && !saving && !restoring;
}

export function shouldDeferCoreFlightSourceRejection(phase: CoreFlightRetrievalPhase, saving: boolean, restoring: boolean): boolean {
  return !canCancelCoreFlightSource(phase, saving, restoring);
}

export function mayReviewCoreFlightCapture(input: {
  admission: CoreFlightReviewAdmission | null;
  generation: number;
  foreground: boolean;
  retrievalPhase: CoreFlightRetrievalPhase;
  saving: boolean;
  restoring: boolean;
  busy: boolean;
  recovery: boolean;
  captureId: string | null;
  handledCaptureId: string | null;
}): boolean {
  const admission = input.admission;
  return !!admission && admission.nonce.length > 0 && input.foreground &&
    input.generation === admission.generation && input.retrievalPhase === 'idle' &&
    !input.saving && !input.restoring && !input.busy && !input.recovery &&
    !!input.captureId && input.captureId !== admission.previousCaptureId &&
    input.captureId !== input.handledCaptureId;
}
