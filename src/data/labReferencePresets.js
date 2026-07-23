// Reference-range presets are suggestions only, sourced from commonly-cited
// general adult lab reference intervals. They are never universally "normal"
// or diagnostic — actual reference ranges vary by lab, method, age, sex, and
// individual context. Always defer to the range printed on the lab report.
export const LAB_REFERENCE_PRESETS = [
  {
    canonicalName: "Platelets",
    category: "CBC",
    aliases: ["platelet", "platelets", "plt"],
    units: { "K/uL": { low: 150, high: 450 } },
  },
  {
    canonicalName: "WBC",
    category: "CBC",
    aliases: ["wbc", "white blood cell", "white blood cells", "white blood cell count"],
    units: { "K/uL": { low: 4.5, high: 11.0 } },
  },
  {
    canonicalName: "RBC",
    category: "CBC",
    aliases: ["rbc", "red blood cell", "red blood cells", "red blood cell count"],
    units: { "M/uL": { low: 4.2, high: 5.9 } },
  },
  {
    canonicalName: "Hemoglobin",
    category: "CBC",
    aliases: ["hemoglobin", "hgb", "hb"],
    units: { "g/dL": { low: 12.0, high: 17.5 } },
  },
  {
    canonicalName: "Hematocrit",
    category: "CBC",
    aliases: ["hematocrit", "hct"],
    units: { "%": { low: 36, high: 50 } },
  },
  {
    canonicalName: "MCV",
    category: "CBC",
    aliases: ["mcv", "mean corpuscular volume"],
    units: { fL: { low: 80, high: 100 } },
  },
  {
    canonicalName: "Vitamin D",
    category: "Vitamins",
    aliases: [
      "vitamin d",
      "25-oh vitamin d",
      "25-hydroxy vitamin d",
      "vit d",
      "25(oh)d",
    ],
    units: { "ng/mL": { low: 30, high: 100 } },
  },
  {
    canonicalName: "Vitamin B12",
    category: "Vitamins",
    aliases: ["vitamin b12", "vitamin b-12", "b12", "vit b12", "cobalamin"],
    units: { "pg/mL": { low: 200, high: 900 } },
  },
  {
    canonicalName: "Ferritin",
    category: "Iron",
    aliases: ["ferritin"],
    units: { "ng/mL": { low: 20, high: 250 } },
  },
  {
    canonicalName: "Iron",
    category: "Iron",
    aliases: ["iron", "serum iron", "fe"],
    units: { "ug/dL": { low: 60, high: 170 } },
  },
  {
    canonicalName: "Glucose",
    category: "Glucose",
    aliases: ["glucose", "fasting glucose", "blood glucose", "fbg"],
    units: { "mg/dL": { low: 70, high: 99 } },
  },
  {
    canonicalName: "HbA1c",
    category: "Glucose",
    aliases: ["hba1c", "a1c", "hemoglobin a1c"],
    units: { "%": { low: 4.0, high: 5.6 } },
  },
  {
    canonicalName: "Total Cholesterol",
    category: "Lipids",
    aliases: ["total cholesterol", "cholesterol", "cholesterol total", "chol"],
    units: { "mg/dL": { low: 125, high: 200 } },
  },
  {
    canonicalName: "LDL",
    category: "Lipids",
    aliases: ["ldl", "ldl cholesterol", "ldl-c"],
    units: { "mg/dL": { low: 0, high: 99 } },
  },
  {
    canonicalName: "HDL",
    category: "Lipids",
    aliases: ["hdl", "hdl cholesterol", "hdl-c"],
    units: { "mg/dL": { low: 40, high: 60 } },
  },
  {
    canonicalName: "Triglycerides",
    category: "Lipids",
    aliases: ["triglycerides", "trig", "tg"],
    units: { "mg/dL": { low: 0, high: 149 } },
  },
  {
    canonicalName: "TSH",
    category: "Thyroid",
    aliases: ["tsh", "thyroid stimulating hormone", "thyrotropin"],
    units: { "uIU/mL": { low: 0.4, high: 4.0 } },
  },
];

export const normalizeTestName = (name) => (name ?? "").toLowerCase().trim().replace(/\s+/g, " ");

export const findLabPreset = (testName) => {
  const normalized = normalizeTestName(testName);
  if (!normalized) return null;

  return (
    LAB_REFERENCE_PRESETS.find(
      (preset) =>
        normalizeTestName(preset.canonicalName) === normalized ||
        preset.aliases.some((alias) => normalizeTestName(alias) === normalized)
    ) ?? null
  );
};

export const getPresetDefaultUnit = (preset) =>
  preset ? Object.keys(preset.units)[0] ?? null : null;

export const getPresetRangeForUnit = (preset, unit) =>
  preset && unit && preset.units[unit] ? preset.units[unit] : null;
