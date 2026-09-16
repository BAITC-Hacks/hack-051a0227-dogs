// Recovery cache for an unsent recording only; persisted records live on the server.
const dbName = "leader-recording-recovery";
const blockedOwners = new Set<string>();
export const recordingKey = (
  userId: string,
  applicationId: string,
  kind: string,
) => `${userId}:${applicationId}:${kind}`;
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("recordings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function cacheRecording(key: string, blob: Blob) {
  const db = await open();
  if (blockedOwners.has(key.split(":")[0])) {
    db.close();
    return;
  }
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite");
    tx.objectStore("recordings").put(blob, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function clearUserRecordings(userId: string) {
  blockedOwners.add(userId);
  window.dispatchEvent(
    new CustomEvent("leader-recording-logout", { detail: userId }),
  );
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("leader-recording-session")
      : null;
  channel?.postMessage(userId);
  channel?.close();
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite");
    const store = tx.objectStore("recordings");
    const request = store.openKeyCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (String(cursor.key).startsWith(userId + ":")) store.delete(cursor.key);
      cursor.continue();
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export function allowUserRecordings(userId: string) {
  blockedOwners.delete(userId);
}
export function blockUserRecordings(userId: string) {
  blockedOwners.add(userId);
}
export async function restoreRecording(key: string) {
  const db = await open();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction("recordings");
    const r = tx.objectStore("recordings").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function clearRecording(key: string) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite");
    tx.objectStore("recordings").delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
