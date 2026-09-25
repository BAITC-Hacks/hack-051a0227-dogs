/** Preserve the exact item set; a drop never creates or loses a row. */
export function reorderItems<T>(
  items: T[],
  from: number,
  to: number,
  swap = false,
): T[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    from === to
  )
    return items;
  const next = [...items];
  if (swap) [next[from], next[to]] = [next[to], next[from]];
  else next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
