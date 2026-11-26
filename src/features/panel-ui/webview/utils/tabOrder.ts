/**
 * Pure helpers to keep the user's tab order consistent with the tabs currently available.
 */

/**
 * Applies a stored order to the available tab ids.
 * Stored ids that are no longer available are dropped; tabs missing from the stored order
 * (new tabs, other mode) keep their default relative position after the known ones.
 */
export function applyTabOrder(defaultIds: string[], storedOrder: string[] | undefined): string[] {
  if (!storedOrder || storedOrder.length === 0) {
    return defaultIds;
  }
  const known = storedOrder.filter((id, index) => defaultIds.includes(id) && storedOrder.indexOf(id) === index);
  const unknown = defaultIds.filter((id) => !known.includes(id));
  return [...known, ...unknown];
}

/** Moves the tab `sourceId` to the position currently held by `targetId` */
export function moveTab(order: string[], sourceId: string, targetId: string): string[] {
  const from = order.indexOf(sourceId);
  const to = order.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) {
    return order;
  }
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, sourceId);
  return next;
}

/** Moves a tab one position left (-1) or right (+1); no-op at the edges */
export function shiftTab(order: string[], tabId: string, direction: -1 | 1): string[] {
  const index = order.indexOf(tabId);
  const target = order[index + direction];
  return index === -1 || target === undefined ? order : moveTab(order, tabId, target);
}
