import { equalData, mergeData } from "./mergeData.js";

// One serialized queue per domain, kept alive across route changes. Reads and
// writes never race; new edits made during an IPC request are rebased afterwards.
export function createSyncedData({
  initial,
  empty,
  read,
  write,
  cache,
  onError,
}) {
  let snapshot = {
    data: initial,
    status: read ? "loading" : "local",
    error: null,
  };
  let base = initial,
    started = false,
    busy = false,
    requested = false,
    loaded = !read;
  const subscribers = new Set();
  const publish = (data, status = snapshot.status, error = null) => {
    if (
      equalData(data, snapshot.data) &&
      status === snapshot.status &&
      error === snapshot.error
    )
      return;
    snapshot = { data, status, error };
    subscribers.forEach((fn) => fn());
  };
  const pump = async () => {
    if (!read || busy || !started) return;
    busy = true;
    try {
      if (!loaded) {
        const sent = snapshot.data;
        const result = await read();
        const data = result.initialized
          ? result.data
          : await write(sent, empty, true);
        base = data;
        loaded = true;
        publish(mergeData(sent, snapshot.data, data), "ready");
      }
      while (requested || !equalData(base, snapshot.data)) {
        requested = false;
        const sent = snapshot.data;
        const dirty = !equalData(base, sent);
        const data = dirty
          ? await write(sent, base, false)
          : (await read()).data;
        base = data;
        publish(mergeData(sent, snapshot.data, data), "ready");
      }
    } catch (error) {
      const message = String(error);
      const changed = snapshot.error !== message;
      publish(snapshot.data, "error", message);
      if (changed) onError?.(message);
    } finally {
      busy = false;
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    update: (updater) => {
      const data =
        typeof updater === "function" ? updater(snapshot.data) : updater;
      if (equalData(data, snapshot.data)) return;
      publish(data);
      if (!read) cache?.(data);
      // Batch list renames + task reference changes into the same transaction.
      queueMicrotask(pump);
    },
    start: () => {
      if (!started) {
        started = true;
        requested = true;
        void pump();
      }
    },
    refresh: () => {
      requested = true;
      void pump();
    },
  };
}
