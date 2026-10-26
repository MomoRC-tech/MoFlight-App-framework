/** One explicit decision; late native callbacks cannot authorize a different scope. */
export function createSyncConfirmation() {
  let pending: { scope: string } | null = null;
  return {
    request(scope: string, allowed: boolean) {
      if (!allowed || pending) return null;
      const ticket = { scope }; pending = ticket;
      return {
        cancel() { if (pending === ticket) pending = null; },
        confirm(currentScope: string, currentlyAllowed: boolean) {
          if (pending !== ticket) return false;
          pending = null;
          return currentlyAllowed && currentScope === ticket.scope;
        },
      };
    },
    invalidate() { pending = null; },
  };
}
