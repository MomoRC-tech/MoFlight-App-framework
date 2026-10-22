import type { ConnectionState } from './connection-state';

/** Presentation is owned here; account authorization remains in ConnectionSession. */
export type ConnectionFlow =
  | { phase: 'idle' | 'checking' | 'sign-in' | 'verifying' | 'connected' | 'cancelled' }
  | { phase: 'error'; reason: 'verification' | 'account-mismatch' | 'page' };
export type ConnectionFlowEvent =
  | { type: 'show-login' | 'hide-login' | 'cancel' | 'page-error' }
  | { type: 'proof'; state: ConnectionState };

export function connectionFlow(state: ConnectionFlow, event: ConnectionFlowEvent): ConnectionFlow {
  switch (event.type) {
    case 'show-login': return { phase: 'sign-in' };
    case 'hide-login': return state.phase === 'connected' || state.phase === 'error' ? state : { phase: 'idle' };
    case 'cancel': return { phase: 'cancelled' };
    case 'page-error': return { phase: 'error', reason: 'page' };
    case 'proof':
      switch (event.state.phase) {
        case 'checking': return { phase: state.phase === 'sign-in' ? 'verifying' : 'checking' };
        case 'login-required': return { phase: 'sign-in' };
        case 'observed': return event.state.confirmed ? { phase: 'connected' } : { phase: 'verifying' };
        case 'error': return { phase: 'error', reason: 'verification' };
        case 'mismatch': return { phase: 'error', reason: 'account-mismatch' };
        default: return state.phase === 'sign-in' || state.phase === 'error' || state.phase === 'cancelled' ? state : { phase: 'idle' };
      }
  }
}
