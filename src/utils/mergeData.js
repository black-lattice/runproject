// Same semantics as data_merge.rs: merge changes by entity and field, never
// replace an entire stale snapshot. A removed entity wins over a stale edit.
export const equalData = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const key = (item, field) =>
  String(
    field === "lists"
      ? item[0]
      : ["tasks", "subtasks"].includes(field)
        ? item.id
        : item.path,
  );
export function mergeData(base, local, remote, field = "") {
  if (equalData(base, local)) return remote;
  if (object(base) && object(local) && object(remote)) {
    const result = { ...remote };
    for (const k of new Set([...Object.keys(base), ...Object.keys(local)])) {
      if (equalData(base[k], local[k])) continue;
      if (Object.hasOwn(local, k))
        result[k] = mergeData(base[k], local[k], remote[k], k);
      else delete result[k];
    }
    return result;
  }
  if (
    ["tasks", "lists", "workspaces", "projects", "subtasks"].includes(field) &&
    [base, local, remote].every(Array.isArray)
  ) {
    if (
      field === "lists" &&
      [...base, ...local, ...remote].some((v) => !Array.isArray(v))
    )
      return local;
    const index = (items) =>
      new Map(items.map((item) => [key(item, field), item]));
    const b = index(base),
      l = index(local),
      r = index(remote);
    const result = [];
    for (const item of local) {
      const k = key(item, field);
      if (b.has(k) && r.has(k))
        result.push(mergeData(b.get(k), item, r.get(k)));
      else if (!b.has(k)) result.push(r.get(k) ?? item);
    }
    for (const item of remote) {
      const k = key(item, field);
      if (!b.has(k) && !l.has(k)) result.push(item);
    }
    return result;
  }
  return local;
}
