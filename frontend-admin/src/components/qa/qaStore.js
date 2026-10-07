const DB_NAME = 'nst-qa-tracker';
const DB_VERSION = 1;
const SESSION_STORE = 'sessions';
const EVENT_STORE = 'events';
const FILE_STORE = 'files';

let dbPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

export function openQaDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable in this browser'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const sessions = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
        sessions.createIndex('status', 'status', { unique: false });
        sessions.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(EVENT_STORE)) {
        const events = db.createObjectStore(EVENT_STORE, { keyPath: 'id', autoIncrement: true });
        events.createIndex('sessionId', 'sessionId', { unique: false });
        events.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        const files = db.createObjectStore(FILE_STORE, { keyPath: 'id', autoIncrement: true });
        files.createIndex('sessionId', 'sessionId', { unique: false });
        files.createIndex('eventId', 'eventId', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Unable to open QA tracker database'));
    };
  });
  return dbPromise;
}

export async function createQaSession(session) {
  const db = await openQaDatabase();
  const transaction = db.transaction(SESSION_STORE, 'readwrite');
  transaction.objectStore(SESSION_STORE).put(session);
  await transactionDone(transaction);
  return session;
}

export async function updateQaSession(id, patch) {
  const db = await openQaDatabase();
  const transaction = db.transaction(SESSION_STORE, 'readwrite');
  const store = transaction.objectStore(SESSION_STORE);
  const current = await requestToPromise(store.get(id));
  if (!current) throw new Error('QA session not found');
  const next = { ...current, ...patch, id, updatedAt: new Date().toISOString() };
  store.put(next);
  await transactionDone(transaction);
  return next;
}

export async function getQaSession(id) {
  if (!id) return null;
  const db = await openQaDatabase();
  const transaction = db.transaction(SESSION_STORE, 'readonly');
  return requestToPromise(transaction.objectStore(SESSION_STORE).get(id));
}

export async function addQaEvent(event) {
  const db = await openQaDatabase();
  const transaction = db.transaction(EVENT_STORE, 'readwrite');
  const id = await requestToPromise(transaction.objectStore(EVENT_STORE).add(event));
  await transactionDone(transaction);
  return { ...event, id };
}

export async function getQaEvents(sessionId) {
  if (!sessionId) return [];
  const db = await openQaDatabase();
  const transaction = db.transaction(EVENT_STORE, 'readonly');
  const index = transaction.objectStore(EVENT_STORE).index('sessionId');
  const rows = await requestToPromise(index.getAll(window.IDBKeyRange.only(sessionId)));
  return rows.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

export async function addQaFile(file) {
  const db = await openQaDatabase();
  const transaction = db.transaction(FILE_STORE, 'readwrite');
  const id = await requestToPromise(transaction.objectStore(FILE_STORE).add(file));
  await transactionDone(transaction);
  return { ...file, id };
}

export async function getQaFiles(sessionId) {
  if (!sessionId) return [];
  const db = await openQaDatabase();
  const transaction = db.transaction(FILE_STORE, 'readonly');
  const index = transaction.objectStore(FILE_STORE).index('sessionId');
  return requestToPromise(index.getAll(window.IDBKeyRange.only(sessionId)));
}

export async function deleteQaSession(id) {
  if (!id) return;
  const db = await openQaDatabase();
  const transaction = db.transaction([SESSION_STORE, EVENT_STORE, FILE_STORE], 'readwrite');
  transaction.objectStore(SESSION_STORE).delete(id);

  const deleteByIndex = (storeName, indexName) => new Promise((resolve, reject) => {
    const store = transaction.objectStore(storeName);
    const request = store.index(indexName).openCursor(window.IDBKeyRange.only(id));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error(`Unable to clear ${storeName}`));
  });

  await Promise.all([
    deleteByIndex(EVENT_STORE, 'sessionId'),
    deleteByIndex(FILE_STORE, 'sessionId'),
  ]);
  await transactionDone(transaction);
}

export async function clearAllQaData() {
  const db = await openQaDatabase();
  const transaction = db.transaction([SESSION_STORE, EVENT_STORE, FILE_STORE], 'readwrite');
  transaction.objectStore(SESSION_STORE).clear();
  transaction.objectStore(EVENT_STORE).clear();
  transaction.objectStore(FILE_STORE).clear();
  await transactionDone(transaction);
}
