// The persistence commit is the final fallible step. Publishing already-read
// state is synchronous; failed reads or commits close only the staged candidate.
export async function activatePrepared<T>(prepare: () => Promise<T>, commit: () => Promise<void>, publish: (prepared: T) => void, closeCandidate: () => Promise<void>) {
  let prepared: T;
  try { prepared = await prepare(); await commit(); }
  catch (e) { await closeCandidate(); throw e; }
  publish(prepared);
}
