import * as SQLite from 'expo-sqlite';
import type { ProbeSnapshot } from './probe';
import type { Connection } from '@moflight/local-data';
import { CAPTURE_SCHEMA, persistCapture, readLatestCapture } from './capture-store';
import { RUN_SCHEMA, persistRun, latestRun, type CaptureRun } from './capture-run';
import { WINDOW_SCHEMA, persistWindow, latestWindow, type WindowRun } from './window';

function connection(db: SQLite.SQLiteDatabase): Connection {
  return { exec: sql => db.execAsync(sql), run: async (sql, ...params) => { await db.runAsync(sql, ...params); },
    first: (sql, ...params) => db.getFirstAsync(sql, ...params), all: (sql, ...params) => db.getAllAsync(sql, ...params) };
}

// Separate database: captures cannot change synthetic history, decisions or backups.
async function database() {
  const db = await SQLite.openDatabaseAsync('vereinsflieger-access-probe.sqlite');
  try { await db.execAsync(CAPTURE_SCHEMA + ';' + RUN_SCHEMA + WINDOW_SCHEMA); }
  catch (e) { await db.closeAsync(); throw e; }
  return db;
}
export async function saveCapture(snapshot: ProbeSnapshot): Promise<void> {
  const db = await database();
  try { await persistCapture(connection(db), snapshot); }
  finally { await db.closeAsync(); }
}
export async function latestCapture(): Promise<ProbeSnapshot | null> {
  const db = await database();
  try { return await readLatestCapture(connection(db)); }
  finally { await db.closeAsync(); }
}
export async function saveRun(run: CaptureRun) { const db=await database();try{await persistRun(connection(db),run);}finally{await db.closeAsync();} }
export async function readRun() { const db=await database();try{return await latestRun(connection(db));}finally{await db.closeAsync();} }
export async function saveWindow(run: WindowRun) { const db=await database();try{await persistWindow(connection(db),run);}finally{await db.closeAsync();} }
export async function readWindow() { const db=await database();try{return await latestWindow(connection(db));}finally{await db.closeAsync();} }
