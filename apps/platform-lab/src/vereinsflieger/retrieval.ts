// Request ownership only; provider login and account verification stay separate.
export type RetrievalState = { phase: 'idle' } | { phase: 'loading' | 'saving'; nonce: string };
export class Retrieval {
  state: RetrievalState = { phase: 'idle' };
  start(nonce: string): boolean {
    if (this.state.phase !== 'idle') return false;
    this.state = { phase: 'loading', nonce }; return true;
  }
  owns(nonce: string): boolean { return this.state.phase !== 'idle' && this.state.nonce === nonce; }
  beginSave(nonce: string): boolean {
    if (this.state.phase !== 'loading' || !this.owns(nonce)) return false;
    this.state = { phase: 'saving', nonce }; return true;
  }
  finish(nonce: string): boolean {
    if (!this.owns(nonce)) return false;
    this.state = { phase: 'idle' }; return true;
  }
  cancel(): boolean {
    // Once SQLite starts, wait for its verdict rather than claim rollback.
    if (this.state.phase !== 'loading') return false;
    this.state = { phase: 'idle' }; return true;
  }
  dispose(): void { this.state = { phase: 'idle' }; }
}
