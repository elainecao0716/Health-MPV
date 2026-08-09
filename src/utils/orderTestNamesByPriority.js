// Reorders a list of available test names so a caller-supplied "priority" list (e.g. the app's
// common/quick-pick tests) surfaces first — used to make the Lab Trend selector show familiar
// tests before the long tail, without losing any name that's actually available.
export const orderTestNamesByPriority = (priorityNames, availableNames) => {
  const availableSet = new Set(availableNames);
  const prioritySet = new Set(priorityNames);

  const priorityFirst = priorityNames.filter((name) => availableSet.has(name));
  const rest = availableNames.filter((name) => !prioritySet.has(name));

  return [...priorityFirst, ...rest];
};
