// Client-side-only association between a saved report's date and the PDF filename it came from.
// lab_results.source_filename is now the source of truth (works across browsers/devices) — this
// is only a fallback for rows saved before that column existed, or on a different browser/device
// for those older rows specifically.
const storageKey = (userId) => `healthMpvImportedFilenames_${userId}`;

export const rememberImportedFilename = (userId, testDate, fileName) => {
  if (!userId || !testDate || !fileName) return;
  const map = getImportedFilenames(userId);
  map[testDate] = fileName;
  localStorage.setItem(storageKey(userId), JSON.stringify(map));
};

export const getImportedFilenames = (userId) => {
  if (!userId) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};
