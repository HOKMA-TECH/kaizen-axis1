/**
 * useIncomeAnalysisPersistence
 * Salva e restaura a sessão de Apuração de Renda no IndexedDB.
 * Auto-save sempre que o estado mudar; restaura na montagem do componente.
 */

import { useEffect, useRef, useCallback } from 'react';

const DB_NAME = 'kaizen_axis';
const STORE_NAME = 'income_session';
const SESSION_KEY = 'current';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export interface IncomeSessionData {
  nomeCliente: string;
  cpf: string;
  clienteVinculado: string;
  step: 1 | 2;
  resultado: unknown | null;
  exclusionBubbles: string[];
  userOverrides: Record<string, boolean>;
  savedAt: string; // ISO string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(db: IDBDatabase): Promise<IncomeSessionData | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(SESSION_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(db: IDBDatabase, data: IncomeSessionData): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(data, SESSION_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(SESSION_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

interface UseIncomeAnalysisPersistenceOptions {
  onRestore: (data: IncomeSessionData) => void;
  onRestoreConfirmNeeded: (data: IncomeSessionData) => void; // called when >2h old
}

export function useIncomeAnalysisPersistence({
  onRestore,
  onRestoreConfirmNeeded,
}: UseIncomeAnalysisPersistenceOptions) {
  const dbRef = useRef<IDBDatabase | null>(null);

  // Open DB on mount and check for saved session
  useEffect(() => {
    let cancelled = false;
    openDB().then(async (db) => {
      if (cancelled) return;
      dbRef.current = db;
      const saved = await dbGet(db);
      if (!saved || cancelled) return;
      const age = Date.now() - new Date(saved.savedAt).getTime();
      if (age > TWO_HOURS_MS) {
        onRestoreConfirmNeeded(saved);
      } else {
        onRestore(saved);
      }
    }).catch(() => { /* IndexedDB not available */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (data: Omit<IncomeSessionData, 'savedAt'>) => {
    if (!dbRef.current) return;
    await dbSet(dbRef.current, { ...data, savedAt: new Date().toISOString() });
  }, []);

  const clear = useCallback(async () => {
    if (!dbRef.current) return;
    await dbClear(dbRef.current);
  }, []);

  return { save, clear };
}

export { TWO_HOURS_MS };
