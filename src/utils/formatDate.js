// Compact "MM/DD" formatting shared by every chart tick/tooltip in the app (weight trend, lab
// trend) — was previously duplicated verbatim under two different names.
export const formatMonthDay = (dateStr) => {
  const [, month, day] = dateStr.split("-");
  return `${month}/${day}`;
};

const MONTH_ABBREVIATIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "YYYY-MM-DD" -> "Jul 20, 2026", for display contexts (like Lab History) that span more than
// one year and need the year to stay unambiguous. Parses the parts directly rather than
// `new Date(dateStr)`, which treats a bare date string as UTC midnight and can shift the
// displayed day backward in negative-UTC-offset timezones.
export const formatFullDate = (dateStr) => {
  const [year, month, day] = dateStr.split("-");
  return `${MONTH_ABBREVIATIONS[Number(month) - 1]} ${Number(day)}, ${year}`;
};
