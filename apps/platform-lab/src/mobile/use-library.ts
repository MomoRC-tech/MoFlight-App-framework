import { useCallback, useEffect, useRef, useState } from 'react';
import { effective, type Flight } from '@moflight/flight-logbook';
import type { PilotBooks, Book } from '../../../../packages/local-data/src/books';
import { loadBooks, rememberedBook, rememberBook } from '../book-storage';

export interface LibraryView { books: Book[]; bookId: string | null; flights: Flight[]; pending: number | null }
const empty: LibraryView = { books: [], bookId: null, flights: [], pending: null };
export function useLibrary(suspended: boolean) {
  const [data, setData] = useState<LibraryView>(empty);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lib = useRef<PilotBooks | null>(null);
  const alive = useRef(false);
  const lock = useRef(false);
  const pendingReload = useRef(false);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const close = async (repository: PilotBooks | null) => {
    // Cleanup failure must not strand the loading lock or reject a fire-and-forget operation.
    try { await repository?.db.close(); } catch { /* The persisted library remains untouched. */ }
  };
  const read = useCallback(async (repository: PilotBooks, preferred?: string) => {
    const books = await repository.books();
    const remembered = preferred ?? await rememberedBook(repository);
    const bookId = books.find(b => b.id === remembered)?.id ?? books[0]?.id ?? null;
    if (!bookId) return { ...empty, books };
    const history = await repository.history(bookId);
    const flights = effective(history);
    const written = new Set(history.paper.map(p => p.flight.id));
    return { books, bookId, flights, pending: new Set(flights.filter(f => !written.has(f.id)).map(f => f.id)).size };
  }, []);
  const reload: () => Promise<void> = useCallback(async () => {
    if (!alive.current) return;
    if (lock.current || suspendedRef.current) { pendingReload.current = true; return; }
    pendingReload.current = false;
    lock.current = true; setBusy(true); setError(null);
    let next: PilotBooks | null = null;
    try {
      next = (await loadBooks()).lib;
      const view = await read(next);
      if (!alive.current) return;
      const previous = lib.current; lib.current = next; next = null;
      setData(view); await close(previous);
    } catch { if (alive.current) setError('Lokale Bibliothek konnte nicht geladen werden. Gespeicherte Daten bleiben erhalten.'); }
    finally {
      await close(next);
      if (!alive.current) { const previous = lib.current; lib.current = null; await close(previous); }
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        if (pendingReload.current && !suspendedRef.current) void reload();
      }
    }
  }, [read]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // An in-flight operation owns the handle until its finally block completes.
      if (!lock.current) { const previous = lib.current; lib.current = null; void close(previous); }
    };
  }, []);
  useEffect(() => { if (!suspended) void reload(); }, [reload, suspended]);
  const selectBook = async (id: string) => {
    if (!alive.current || lock.current || !lib.current) return;
    const repository = lib.current;
    lock.current = true; setBusy(true); setError(null);
    try {
      const view = await read(repository, id);
      if (!alive.current) return;
      await rememberBook(repository, id);
      if (alive.current) setData(view);
    } catch { if (alive.current) setError('Flugbuchwechsel fehlgeschlagen. Bitte erneut versuchen.'); }
    finally {
      if (!alive.current) { lib.current = null; await close(repository); }
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        if (pendingReload.current && !suspendedRef.current) void reload();
      }
    }
  };
  return { ...data, busy, error, reload, selectBook };
}
