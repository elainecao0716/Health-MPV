import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";
import { supabase } from "./supabase";
import AiCoachCard from "./components/AiCoachCard";
import AiChatCard from "./components/AiChatCard";
import AuthScreen from "./components/AuthScreen";
import {
  findLabPreset,
  getPresetDefaultUnit,
  getPresetRangeForUnit,
} from "./data/labReferencePresets";

const goalStorageKey = (userId) => `healthMpvGoalWeight_${userId}`;
const labFavoritesStorageKey = (userId) => `healthMpvLabFavorites_${userId}`;

// Only fills fields that are currently blank — never overwrites what the user typed.
const computePresetAutoFill = (testName, current) => {
  const preset = findLabPreset(testName);
  if (!preset) return {};

  const presetUnit = getPresetDefaultUnit(preset);
  const range = getPresetRangeForUnit(preset, presetUnit);
  const patch = {};

  if (current.category === "") patch.category = preset.category;
  if (current.unit === "" && presetUnit) patch.unit = presetUnit;
  if (range) {
    if (current.referenceLow === "") patch.referenceLow = String(range.low);
    if (current.referenceHigh === "") patch.referenceHigh = String(range.high);
  }

  return patch;
};

// Explicit "Use suggested range" action — overwrites regardless of blank state.
const computePresetForceApply = (testName) => {
  const preset = findLabPreset(testName);
  if (!preset) return null;

  const presetUnit = getPresetDefaultUnit(preset);
  const range = getPresetRangeForUnit(preset, presetUnit);

  return {
    category: preset.category,
    unit: presetUnit ?? "",
    referenceLow: range ? String(range.low) : "",
    referenceHigh: range ? String(range.high) : "",
  };
};

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [recordDate, setRecordDate] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState(null); // { type: "success" | "error", message: string }
  const [saving, setSaving] = useState(false);

  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [listError, setListError] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState(null); // { type: "success" | "error", message: string }

  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [updateStatus, setUpdateStatus] = useState(null); // { type: "success" | "error", message: string }

  const [heightInches, setHeightInches] = useState("65");

  const [goalInput, setGoalInput] = useState("");
  const [savedGoal, setSavedGoal] = useState(null);
  const [goalError, setGoalError] = useState(null);

  const MOOD_OPTIONS = ["😊 Great", "🙂 Good", "😐 Okay", "😟 Low", "😫 Stressed"];

  const [checkinDate, setCheckinDate] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [waterCups, setWaterCups] = useState("");
  const [exerciseMinutes, setExerciseMinutes] = useState("");
  const [mood, setMood] = useState("");
  const [checkinNotes, setCheckinNotes] = useState("");
  const [checkinStatus, setCheckinStatus] = useState(null);
  const [checkinSaving, setCheckinSaving] = useState(false);

  const [checkins, setCheckins] = useState([]);
  const [loadingCheckins, setLoadingCheckins] = useState(true);
  const [checkinListError, setCheckinListError] = useState(null);
  const [checkinDeleteStatus, setCheckinDeleteStatus] = useState(null);

  const [editingCheckinId, setEditingCheckinId] = useState(null);
  const [editCheckinDate, setEditCheckinDate] = useState("");
  const [editSleepHours, setEditSleepHours] = useState("");
  const [editWaterCups, setEditWaterCups] = useState("");
  const [editExerciseMinutes, setEditExerciseMinutes] = useState("");
  const [editMood, setEditMood] = useState("");
  const [editCheckinNotes, setEditCheckinNotes] = useState("");
  const [checkinUpdateStatus, setCheckinUpdateStatus] = useState(null);

  const QUICK_TEST_NAMES = [
    "Platelets",
    "WBC",
    "RBC",
    "Hemoglobin",
    "Hematocrit",
    "MCV",
    "Vitamin D",
    "Vitamin B12",
    "Ferritin",
    "Iron",
    "Glucose",
    "HbA1c",
    "Total Cholesterol",
    "LDL",
    "HDL",
    "Triglycerides",
    "TSH",
  ];
  const LAB_CATEGORIES = ["CBC", "Metabolic", "Vitamins", "Lipids", "Thyroid", "Glucose", "Iron", "Other"];

  const [labTestDate, setLabTestDate] = useState("");
  const [labTestName, setLabTestName] = useState("");
  const [labCategory, setLabCategory] = useState("");
  const [labResultValue, setLabResultValue] = useState("");
  const [labUnit, setLabUnit] = useState("");
  const [labReferenceLow, setLabReferenceLow] = useState("");
  const [labReferenceHigh, setLabReferenceHigh] = useState("");
  const [labLabName, setLabLabName] = useState("");
  const [labNotes, setLabNotes] = useState("");
  const [labStatus, setLabStatus] = useState(null);
  const [labSaving, setLabSaving] = useState(false);
  // Tracks whether the current reference range came from a preset or was
  // typed by hand, so a later unit change can safely drop a now-incompatible
  // preset range without touching anything the user entered themselves.
  const [labRangeSource, setLabRangeSource] = useState(null); // "preset" | "custom" | null

  const [favoriteTestNames, setFavoriteTestNames] = useState([]);

  const [labResults, setLabResults] = useState([]);
  const [loadingLabResults, setLoadingLabResults] = useState(true);
  const [labListError, setLabListError] = useState(null);
  const [labDeleteStatus, setLabDeleteStatus] = useState(null);

  const [editingLabId, setEditingLabId] = useState(null);
  const [editLabTestDate, setEditLabTestDate] = useState("");
  const [editLabTestName, setEditLabTestName] = useState("");
  const [editLabCategory, setEditLabCategory] = useState("");
  const [editLabResultValue, setEditLabResultValue] = useState("");
  const [editLabUnit, setEditLabUnit] = useState("");
  const [editLabReferenceLow, setEditLabReferenceLow] = useState("");
  const [editLabReferenceHigh, setEditLabReferenceHigh] = useState("");
  const [editLabLabName, setEditLabLabName] = useState("");
  const [editLabNotes, setEditLabNotes] = useState("");
  const [editLabRangeSource, setEditLabRangeSource] = useState(null); // "preset" | "custom" | null
  const [labUpdateStatus, setLabUpdateStatus] = useState(null);

  const [labFilterTestName, setLabFilterTestName] = useState("");
  const [labFilterCategory, setLabFilterCategory] = useState("");
  const [labFilterStartDate, setLabFilterStartDate] = useState("");
  const [labFilterEndDate, setLabFilterEndDate] = useState("");
  const [labSearchQuery, setLabSearchQuery] = useState("");

  const [selectedChartTest, setSelectedChartTest] = useState("");

  const currentUser = session?.user ?? null;

  const fetchRecords = async () => {
    if (!currentUser) return;
    setLoadingRecords(true);
    const { data, error } = await supabase
      .from("health_records")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("record_date", { ascending: false });

    if (error) {
      setListError(error.message);
    } else {
      setListError(null);
      setRecords(data);
    }
    setLoadingRecords(false);
  };

  const fetchCheckins = async () => {
    if (!currentUser) return;
    setLoadingCheckins(true);
    const { data, error } = await supabase
      .from("daily_checkins")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("checkin_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setCheckinListError(error.message);
    } else {
      setCheckinListError(null);
      setCheckins(data);
    }
    setLoadingCheckins(false);
  };

  const fetchLabResults = async () => {
    if (!currentUser) return;
    setLoadingLabResults(true);
    const { data, error } = await supabase
      .from("lab_results")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("test_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setLabListError(error.message);
    } else {
      setLabListError(null);
      setLabResults(data);
    }
    setLoadingLabResults(false);
  };

  // Restore any existing session on load, then just keep local state in sync —
  // no async Supabase calls happen inside this callback itself.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Reacts to the session changing (not the auth callback itself) — this is
  // where the actual async data fetching / clearing happens.
  useEffect(() => {
    if (currentUser) {
      fetchRecords();
      fetchCheckins();
      fetchLabResults();
    } else {
      setRecords([]);
      setCheckins([]);
      setLabResults([]);
      setListError(null);
      setCheckinListError(null);
      setLabListError(null);
      setLoadingRecords(false);
      setLoadingCheckins(false);
      setLoadingLabResults(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) {
      setSavedGoal(null);
      setGoalInput("");
      setGoalError(null);
      return;
    }

    const stored = localStorage.getItem(goalStorageKey(currentUser.id));
    if (stored === null) {
      setSavedGoal(null);
      setGoalInput("");
      return;
    }

    const num = Number(stored);
    if (!Number.isNaN(num) && num > 0) {
      setSavedGoal(num);
      setGoalInput(String(num));
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) {
      setFavoriteTestNames([]);
      return;
    }

    const stored = localStorage.getItem(labFavoritesStorageKey(currentUser.id));
    if (stored === null) {
      setFavoriteTestNames([]);
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      setFavoriteTestNames(Array.isArray(parsed) ? parsed : []);
    } catch {
      setFavoriteTestNames([]);
    }
  }, [currentUser?.id]);

  const handleToggleFavoriteTest = (testName) => {
    if (!currentUser) return;
    const trimmed = testName.trim();
    if (!trimmed) return;

    setFavoriteTestNames((prev) => {
      const next = prev.includes(trimmed)
        ? prev.filter((name) => name !== trimmed)
        : [...prev, trimmed];
      localStorage.setItem(labFavoritesStorageKey(currentUser.id), JSON.stringify(next));
      return next;
    });
  };

  const handleSaveGoal = () => {
    if (!currentUser) return;

    const trimmed = goalInput.trim();
    const num = Number(trimmed);

    if (trimmed === "" || Number.isNaN(num) || num <= 0) {
      setGoalError("Enter a positive number for your goal weight.");
      return;
    }

    setGoalError(null);
    setSavedGoal(num);
    localStorage.setItem(goalStorageKey(currentUser.id), String(num));
  };

  const handleClearGoal = () => {
    if (!currentUser) return;

    setGoalError(null);
    setSavedGoal(null);
    setGoalInput("");
    localStorage.removeItem(goalStorageKey(currentUser.id));
  };

  const validateCheckin = (date, sleep, water, exercise) => {
    if (!date) return "Date is required.";

    if (sleep !== "") {
      const sleepNum = Number(sleep);
      if (Number.isNaN(sleepNum) || sleepNum < 0 || sleepNum > 24) {
        return "Sleep hours must be between 0 and 24.";
      }
    }

    if (water !== "") {
      const waterNum = Number(water);
      if (Number.isNaN(waterNum) || waterNum < 0) {
        return "Water cups cannot be negative.";
      }
    }

    if (exercise !== "") {
      const exerciseNum = Number(exercise);
      if (Number.isNaN(exerciseNum) || exerciseNum < 0) {
        return "Exercise minutes cannot be negative.";
      }
    }

    return null;
  };

  const handleSaveCheckin = async (e) => {
    e.preventDefault();
    setCheckinStatus(null);

    const validationError = validateCheckin(checkinDate, sleepHours, waterCups, exerciseMinutes);
    if (validationError) {
      setCheckinStatus({ type: "error", message: validationError });
      return;
    }

    setCheckinSaving(true);

    const { error } = await supabase.from("daily_checkins").insert([
      {
        user_id: currentUser.id,
        checkin_date: checkinDate,
        sleep_hours: sleepHours === "" ? null : Number(sleepHours),
        water_cups: waterCups === "" ? null : Number(waterCups),
        exercise_minutes: exerciseMinutes === "" ? null : Number(exerciseMinutes),
        mood: mood === "" ? null : mood,
        notes: checkinNotes,
      },
    ]);

    if (error) {
      setCheckinStatus({ type: "error", message: error.message });
    } else {
      setCheckinStatus({ type: "success", message: "Check-in saved!" });
      setCheckinDate("");
      setSleepHours("");
      setWaterCups("");
      setExerciseMinutes("");
      setMood("");
      setCheckinNotes("");
      await fetchCheckins();
    }

    setCheckinSaving(false);
  };

  const handleDeleteCheckin = async (id) => {
    const confirmed = window.confirm("Delete this check-in?");
    if (!confirmed) return;

    setCheckinDeleteStatus(null);
    const { error } = await supabase
      .from("daily_checkins")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) {
      setCheckinDeleteStatus({ type: "error", message: error.message });
    } else {
      setCheckinDeleteStatus({ type: "success", message: "Deleted!" });
      await fetchCheckins();
    }
  };

  const handleCheckinEditClick = (checkin) => {
    setCheckinUpdateStatus(null);
    setEditingCheckinId(checkin.id);
    setEditCheckinDate(checkin.checkin_date);
    setEditSleepHours(checkin.sleep_hours ?? "");
    setEditWaterCups(checkin.water_cups ?? "");
    setEditExerciseMinutes(checkin.exercise_minutes ?? "");
    setEditMood(checkin.mood ?? "");
    setEditCheckinNotes(checkin.notes ?? "");
  };

  const handleCheckinCancelEdit = () => {
    setEditingCheckinId(null);
    setEditCheckinDate("");
    setEditSleepHours("");
    setEditWaterCups("");
    setEditExerciseMinutes("");
    setEditMood("");
    setEditCheckinNotes("");
  };

  const handleUpdateCheckin = async (id) => {
    setCheckinUpdateStatus(null);

    const validationError = validateCheckin(
      editCheckinDate,
      editSleepHours,
      editWaterCups,
      editExerciseMinutes
    );
    if (validationError) {
      setCheckinUpdateStatus({ type: "error", message: validationError });
      return;
    }

    const { data, error } = await supabase
      .from("daily_checkins")
      .update({
        checkin_date: editCheckinDate,
        sleep_hours: editSleepHours === "" ? null : Number(editSleepHours),
        water_cups: editWaterCups === "" ? null : Number(editWaterCups),
        exercise_minutes: editExerciseMinutes === "" ? null : Number(editExerciseMinutes),
        mood: editMood === "" ? null : editMood,
        notes: editCheckinNotes,
      })
      .eq("id", id)
      .eq("user_id", currentUser.id)
      .select();

    if (error) {
      setCheckinUpdateStatus({ type: "error", message: error.message });
    } else if (!data || data.length === 0) {
      setCheckinUpdateStatus({
        type: "error",
        message:
          "Update did not apply — no row was changed. This usually means there is no Row Level Security UPDATE policy allowing this change in Supabase.",
      });
    } else {
      setCheckinUpdateStatus({ type: "success", message: "Updated!" });
      handleCheckinCancelEdit();
      await fetchCheckins();
    }
  };

  const validateLabResult = (date, testName, resultValue, refLow, refHigh) => {
    if (!date) return "Test date is required.";
    if (!testName || !testName.trim()) return "Test name is required.";

    if (resultValue === "" || Number.isNaN(Number(resultValue))) {
      return "Result must be numeric.";
    }

    if (refLow !== "" && Number.isNaN(Number(refLow))) {
      return "Reference low must be numeric.";
    }

    if (refHigh !== "" && Number.isNaN(Number(refHigh))) {
      return "Reference high must be numeric.";
    }

    if (refLow !== "" && refHigh !== "" && Number(refLow) > Number(refHigh)) {
      return "Reference low cannot be greater than reference high.";
    }

    return null;
  };

  // A simple reference-range comparison, not a diagnosis.
  const computeLabStatus = (resultValue, refLow, refHigh) => {
    const hasLow = typeof refLow === "number";
    const hasHigh = typeof refHigh === "number";
    if (!hasLow && !hasHigh) return "No Range";
    if (hasLow && resultValue < refLow) return "Low";
    if (hasHigh && resultValue > refHigh) return "High";
    return "In Range";
  };

  const applyLabTestNameChange = (value) => {
    setLabTestName(value);
    const patch = computePresetAutoFill(value, {
      category: labCategory,
      unit: labUnit,
      referenceLow: labReferenceLow,
      referenceHigh: labReferenceHigh,
    });
    if (patch.category !== undefined) setLabCategory(patch.category);
    if (patch.unit !== undefined) setLabUnit(patch.unit);
    if (patch.referenceLow !== undefined || patch.referenceHigh !== undefined) {
      if (patch.referenceLow !== undefined) setLabReferenceLow(patch.referenceLow);
      if (patch.referenceHigh !== undefined) setLabReferenceHigh(patch.referenceHigh);
      setLabRangeSource("preset");
    }
  };

  const handleLabUnitChange = (value) => {
    setLabUnit(value);
    if (labRangeSource === "preset") {
      const preset = findLabPreset(labTestName);
      const presetUnit = getPresetDefaultUnit(preset);
      if (preset && value !== presetUnit) {
        setLabReferenceLow("");
        setLabReferenceHigh("");
        setLabRangeSource(null);
      }
    }
  };

  const handleUseSuggestedRange = () => {
    const patch = computePresetForceApply(labTestName);
    if (!patch) return;
    setLabCategory(patch.category);
    setLabUnit(patch.unit);
    setLabReferenceLow(patch.referenceLow);
    setLabReferenceHigh(patch.referenceHigh);
    setLabRangeSource("preset");
  };

  const handleClearLabRange = () => {
    setLabReferenceLow("");
    setLabReferenceHigh("");
    setLabRangeSource(null);
  };

  const applyEditLabTestNameChange = (value) => {
    setEditLabTestName(value);
    const patch = computePresetAutoFill(value, {
      category: editLabCategory,
      unit: editLabUnit,
      referenceLow: editLabReferenceLow,
      referenceHigh: editLabReferenceHigh,
    });
    if (patch.category !== undefined) setEditLabCategory(patch.category);
    if (patch.unit !== undefined) setEditLabUnit(patch.unit);
    if (patch.referenceLow !== undefined || patch.referenceHigh !== undefined) {
      if (patch.referenceLow !== undefined) setEditLabReferenceLow(patch.referenceLow);
      if (patch.referenceHigh !== undefined) setEditLabReferenceHigh(patch.referenceHigh);
      setEditLabRangeSource("preset");
    }
  };

  const handleEditLabUnitChange = (value) => {
    setEditLabUnit(value);
    if (editLabRangeSource === "preset") {
      const preset = findLabPreset(editLabTestName);
      const presetUnit = getPresetDefaultUnit(preset);
      if (preset && value !== presetUnit) {
        setEditLabReferenceLow("");
        setEditLabReferenceHigh("");
        setEditLabRangeSource(null);
      }
    }
  };

  const handleUseSuggestedRangeEdit = () => {
    const patch = computePresetForceApply(editLabTestName);
    if (!patch) return;
    setEditLabCategory(patch.category);
    setEditLabUnit(patch.unit);
    setEditLabReferenceLow(patch.referenceLow);
    setEditLabReferenceHigh(patch.referenceHigh);
    setEditLabRangeSource("preset");
  };

  const handleClearLabRangeEdit = () => {
    setEditLabReferenceLow("");
    setEditLabReferenceHigh("");
    setEditLabRangeSource(null);
  };

  const isLabResultCustomRange = (lab) => {
    const preset = findLabPreset(lab.test_name);
    if (!preset) return false;
    const range = getPresetRangeForUnit(preset, lab.unit);
    if (!range) return false;
    if (lab.reference_low === null || lab.reference_high === null) return false;
    return lab.reference_low !== range.low || lab.reference_high !== range.high;
  };

  const handleSaveLabResult = async (e) => {
    e.preventDefault();
    setLabStatus(null);

    const validationError = validateLabResult(
      labTestDate,
      labTestName,
      labResultValue,
      labReferenceLow,
      labReferenceHigh
    );
    if (validationError) {
      setLabStatus({ type: "error", message: validationError });
      return;
    }

    setLabSaving(true);

    const resultNum = Number(labResultValue);
    const refLowNum = labReferenceLow === "" ? null : Number(labReferenceLow);
    const refHighNum = labReferenceHigh === "" ? null : Number(labReferenceHigh);

    const { error } = await supabase.from("lab_results").insert([
      {
        user_id: currentUser.id,
        test_date: labTestDate,
        test_name: labTestName.trim(),
        category: labCategory === "" ? null : labCategory,
        result_value: resultNum,
        unit: labUnit === "" ? null : labUnit,
        reference_low: refLowNum,
        reference_high: refHighNum,
        status: computeLabStatus(resultNum, refLowNum, refHighNum),
        lab_name: labLabName === "" ? null : labLabName,
        notes: labNotes,
      },
    ]);

    if (error) {
      setLabStatus({ type: "error", message: error.message });
    } else {
      setLabStatus({ type: "success", message: "Lab result saved!" });
      setLabTestDate("");
      setLabTestName("");
      setLabCategory("");
      setLabResultValue("");
      setLabUnit("");
      setLabReferenceLow("");
      setLabReferenceHigh("");
      setLabLabName("");
      setLabNotes("");
      setLabRangeSource(null);
      await fetchLabResults();
    }

    setLabSaving(false);
  };

  const handleDeleteLabResult = async (id) => {
    const confirmed = window.confirm("Delete this lab result?");
    if (!confirmed) return;

    setLabDeleteStatus(null);
    const { error } = await supabase
      .from("lab_results")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) {
      setLabDeleteStatus({ type: "error", message: error.message });
    } else {
      setLabDeleteStatus({ type: "success", message: "Deleted!" });
      await fetchLabResults();
    }
  };

  const handleLabEditClick = (lab) => {
    setLabUpdateStatus(null);
    setEditingLabId(lab.id);
    setEditLabTestDate(lab.test_date);
    setEditLabTestName(lab.test_name);
    setEditLabCategory(lab.category ?? "");
    setEditLabResultValue(String(lab.result_value));
    setEditLabUnit(lab.unit ?? "");
    setEditLabReferenceLow(lab.reference_low ?? "");
    setEditLabReferenceHigh(lab.reference_high ?? "");
    setEditLabLabName(lab.lab_name ?? "");
    setEditLabNotes(lab.notes ?? "");
    // null (not "preset") so opening edit never risks clearing the historical
    // range if the unit happens to get touched during this session.
    setEditLabRangeSource(null);
  };

  const handleLabCancelEdit = () => {
    setEditingLabId(null);
    setEditLabTestDate("");
    setEditLabTestName("");
    setEditLabCategory("");
    setEditLabResultValue("");
    setEditLabUnit("");
    setEditLabReferenceLow("");
    setEditLabReferenceHigh("");
    setEditLabLabName("");
    setEditLabNotes("");
    setEditLabRangeSource(null);
  };

  const handleUpdateLabResult = async (id) => {
    setLabUpdateStatus(null);

    const validationError = validateLabResult(
      editLabTestDate,
      editLabTestName,
      editLabResultValue,
      editLabReferenceLow,
      editLabReferenceHigh
    );
    if (validationError) {
      setLabUpdateStatus({ type: "error", message: validationError });
      return;
    }

    const resultNum = Number(editLabResultValue);
    const refLowNum = editLabReferenceLow === "" ? null : Number(editLabReferenceLow);
    const refHighNum = editLabReferenceHigh === "" ? null : Number(editLabReferenceHigh);

    const { data, error } = await supabase
      .from("lab_results")
      .update({
        test_date: editLabTestDate,
        test_name: editLabTestName.trim(),
        category: editLabCategory === "" ? null : editLabCategory,
        result_value: resultNum,
        unit: editLabUnit === "" ? null : editLabUnit,
        reference_low: refLowNum,
        reference_high: refHighNum,
        status: computeLabStatus(resultNum, refLowNum, refHighNum),
        lab_name: editLabLabName === "" ? null : editLabLabName,
        notes: editLabNotes,
      })
      .eq("id", id)
      .eq("user_id", currentUser.id)
      .select();

    if (error) {
      setLabUpdateStatus({ type: "error", message: error.message });
    } else if (!data || data.length === 0) {
      setLabUpdateStatus({
        type: "error",
        message:
          "Update did not apply — no row was changed. This usually means there is no Row Level Security UPDATE policy allowing this change in Supabase.",
      });
    } else {
      setLabUpdateStatus({ type: "success", message: "Updated!" });
      handleLabCancelEdit();
      await fetchLabResults();
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    const { error } = await supabase.from("health_records").insert([
      {
        user_id: currentUser.id,
        record_date: recordDate,
        weight: weight === "" ? null : Number(weight),
        notes,
      },
    ]);

    if (error) {
      setStatus({ type: "error", message: error.message });
    } else {
      setStatus({ type: "success", message: "Saved!" });
      setRecordDate("");
      setWeight("");
      setNotes("");
      await fetchRecords();
    }

    setSaving(false);
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("Delete this record?");
    if (!confirmed) return;

    setDeleteStatus(null);
    const { error } = await supabase
      .from("health_records")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) {
      setDeleteStatus({ type: "error", message: error.message });
    } else {
      setDeleteStatus({ type: "success", message: "Deleted!" });
      await fetchRecords();
    }
  };

  const handleEditClick = (record) => {
    setUpdateStatus(null);
    setEditingId(record.id);
    setEditDate(record.record_date);
    setEditWeight(record.weight ?? "");
    setEditNotes(record.notes ?? "");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDate("");
    setEditWeight("");
    setEditNotes("");
  };

  const handleUpdate = async (id) => {
    setUpdateStatus(null);

    const { data, error } = await supabase
      .from("health_records")
      .update({
        record_date: editDate,
        weight: editWeight === "" ? null : Number(editWeight),
        notes: editNotes,
      })
      .eq("id", id)
      .eq("user_id", currentUser.id)
      .select();

    if (error) {
      setUpdateStatus({ type: "error", message: error.message });
    } else if (!data || data.length === 0) {
      setUpdateStatus({
        type: "error",
        message:
          "Update did not apply — no row was changed. This usually means there is no Row Level Security UPDATE policy allowing this change in Supabase.",
      });
    } else {
      setUpdateStatus({ type: "success", message: "Updated!" });
      handleCancelEdit();
      await fetchRecords();
    }
  };

  const latestRecord = records[0];

  const chartData = [...records].sort(
    (a, b) => new Date(a.record_date) - new Date(b.record_date)
  );

  const formatMonthDay = (dateStr) => {
    const [, month, day] = dateStr.split("-");
    return `${month}/${day}`;
  };

  const weights = records
    .map((r) => r.weight)
    .filter((w) => typeof w === "number" && !Number.isNaN(w));

  const averageWeight = weights.length
    ? weights.reduce((sum, w) => sum + w, 0) / weights.length
    : null;
  const highestWeight = weights.length ? Math.max(...weights) : null;
  const lowestWeight = weights.length ? Math.min(...weights) : null;

  const weightChange =
    records.length >= 2 &&
    typeof records[0].weight === "number" &&
    typeof records[1].weight === "number"
      ? records[0].weight - records[1].weight
      : null;

  const heightNum = Number(heightInches);
  const bmi =
    latestRecord && typeof latestRecord.weight === "number" && heightInches !== "" && heightNum > 0
      ? (703 * latestRecord.weight) / (heightNum * heightNum)
      : null;

  const currentWeight = typeof latestRecord?.weight === "number" ? latestRecord.weight : null;
  const startWeight = typeof chartData[0]?.weight === "number" ? chartData[0].weight : null;

  const poundsRemaining =
    currentWeight !== null && savedGoal !== null ? currentWeight - savedGoal : null;

  const overallChange =
    currentWeight !== null && startWeight !== null ? currentWeight - startWeight : null;

  let progressPercent = null;
  if (currentWeight !== null && savedGoal !== null && startWeight !== null) {
    const totalToChange = startWeight - savedGoal;
    if (totalToChange === 0) {
      progressPercent = currentWeight === savedGoal ? 100 : 0;
    } else {
      const changedSoFar = startWeight - currentWeight;
      progressPercent = Math.max(0, Math.min(100, (changedSoFar / totalToChange) * 100));
    }
  }

  const goalReached = progressPercent !== null && progressPercent >= 100;

  const latestCheckin = checkins[0];

  const distinctLabTestNames = [...new Set(labResults.map((l) => l.test_name))].sort();

  const filteredLabResults = labResults.filter((lab) => {
    if (labFilterTestName && lab.test_name !== labFilterTestName) return false;
    if (labFilterCategory && lab.category !== labFilterCategory) return false;
    if (labFilterStartDate && lab.test_date < labFilterStartDate) return false;
    if (labFilterEndDate && lab.test_date > labFilterEndDate) return false;

    if (labSearchQuery.trim() !== "") {
      const q = labSearchQuery.trim().toLowerCase();
      const haystack = `${lab.test_name} ${lab.category ?? ""} ${lab.lab_name ?? ""} ${
        lab.notes ?? ""
      }`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  const totalLabResults = labResults.length;
  const latestLabResult = labResults[0];
  const outOfRangeLabCount = labResults.filter(
    (l) => l.status === "Low" || l.status === "High"
  ).length;
  const labTestsTracked = distinctLabTestNames.length;

  // Only chart entries that share the most recent unit for this test, per
  // "do not combine tests with different units in the same chart."
  const chartTestEntries = labResults.filter((l) => l.test_name === selectedChartTest);
  const chartUnit = chartTestEntries[0]?.unit ?? null;
  const chartMatchingUnitEntries = chartTestEntries.filter((l) => (l.unit ?? null) === chartUnit);
  const chartDataPoints = [...chartMatchingUnitEntries].sort(
    (a, b) => new Date(a.test_date) - new Date(b.test_date)
  );
  const chartReferenceLow = chartMatchingUnitEntries.find(
    (l) => typeof l.reference_low === "number"
  )?.reference_low ?? null;
  const chartReferenceHigh = chartMatchingUnitEntries.find(
    (l) => typeof l.reference_high === "number"
  )?.reference_high ?? null;

  const formatLabDate = (dateStr) => {
    const [, month, day] = dateStr.split("-");
    return `${month}/${day}`;
  };

  const labStatusClass = (labStatusValue) => {
    if (labStatusValue === "Low") return "lab-status lab-status-low";
    if (labStatusValue === "High") return "lab-status lab-status-high";
    if (labStatusValue === "In Range") return "lab-status lab-status-in-range";
    return "lab-status lab-status-no-range";
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[App] sign out failed:", error.message);
    }
    // onAuthStateChange picks up the SIGNED_OUT event and clears state.
  };

  if (authLoading) {
    return (
      <div className="page">
        <div className="dashboard">
          <p className="empty-text">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return (
    <div className="page">
      <div className="dashboard">
        <div className="auth-bar">
          <span className="auth-email">{currentUser.email}</span>
          <button onClick={handleSignOut} className="btn btn-cancel">
            Sign Out
          </button>
        </div>

        <header className="dashboard-header">
          <h1 className="dashboard-title">❤️ Health MPV Dashboard</h1>
          <p className="dashboard-subtitle">Track your health records and progress.</p>
        </header>

        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Latest Weight</div>
            <div className="summary-value">{latestRecord?.weight ?? "--"}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total Records</div>
            <div className="summary-value">{records.length}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Latest Date</div>
            <div className="summary-value">{latestRecord?.record_date ?? "--"}</div>
          </div>
        </div>

        <div className="card">
          <h2 className="heading-records">Height (for BMI)</h2>
          <label className="field">
            Height (inches)
            <input
              type="number"
              step="any"
              value={heightInches}
              onChange={(e) => setHeightInches(e.target.value)}
              className="input"
            />
          </label>
          <p className="hint-text">Used only to calculate BMI below. Not saved to your records.</p>
        </div>

        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">BMI</div>
            <div className="summary-value">{bmi === null ? "--" : bmi.toFixed(1)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Weight Change</div>
            <div className="summary-value">
              {weightChange === null ? "--" : `${weightChange > 0 ? "+" : ""}${weightChange}`}
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Average Weight</div>
            <div className="summary-value">{averageWeight === null ? "--" : averageWeight.toFixed(1)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Highest Weight</div>
            <div className="summary-value">{highestWeight === null ? "--" : highestWeight}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Lowest Weight</div>
            <div className="summary-value">{lowestWeight === null ? "--" : lowestWeight}</div>
          </div>
        </div>

        <div className="card">
          <h2 className="heading-records">🎯 Goal Weight</h2>
          <label className="field">
            Goal Weight (lbs)
            <input
              type="number"
              step="any"
              min="0"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              className="input"
            />
          </label>

          <div className="goal-actions section">
            <button onClick={handleSaveGoal} className="btn btn-save">
              Save Goal
            </button>
            <button
              onClick={handleClearGoal}
              disabled={savedGoal === null}
              className="btn btn-cancel"
            >
              Clear Goal
            </button>
          </div>

          {goalError && <p className="message message-error">{goalError}</p>}

          {savedGoal === null ? (
            <p className="empty-text section">Enter and save a goal weight to track progress.</p>
          ) : (
            <div className="section">
              <div className="goal-stats">
                <div className="goal-stat">
                  <div className="summary-label">Current Weight</div>
                  <div className="summary-value">
                    {currentWeight === null ? "--" : `${currentWeight} lbs`}
                  </div>
                </div>
                <div className="goal-stat">
                  <div className="summary-label">Goal Weight</div>
                  <div className="summary-value">{`${savedGoal} lbs`}</div>
                </div>
                <div className="goal-stat">
                  <div className="summary-label">Pounds Remaining</div>
                  <div className="summary-value">
                    {poundsRemaining === null ? "--" : `${poundsRemaining.toFixed(1)} lbs`}
                  </div>
                </div>
                <div className="goal-stat">
                  <div className="summary-label">Overall Change</div>
                  <div className="summary-value">
                    {overallChange === null
                      ? "--"
                      : `${overallChange > 0 ? "+" : ""}${overallChange.toFixed(1)} lbs`}
                  </div>
                </div>
                <div className="goal-stat">
                  <div className="summary-label">Progress</div>
                  <div className="summary-value">
                    {progressPercent === null ? "--" : `${progressPercent.toFixed(0)}%`}
                  </div>
                </div>
              </div>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${progressPercent ?? 0}%` }}
                />
              </div>

              {goalReached && (
                <p className="message message-success section">Goal reached! 🎉</p>
              )}
            </div>
          )}
        </div>

        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Latest Mood</div>
            <div className="summary-value">{latestCheckin?.mood ?? "--"}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Latest Sleep</div>
            <div className="summary-value">
              {typeof latestCheckin?.sleep_hours === "number"
                ? `${latestCheckin.sleep_hours} hrs`
                : "--"}
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Latest Water</div>
            <div className="summary-value">
              {typeof latestCheckin?.water_cups === "number"
                ? `${latestCheckin.water_cups} cups`
                : "--"}
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Latest Exercise</div>
            <div className="summary-value">
              {typeof latestCheckin?.exercise_minutes === "number"
                ? `${latestCheckin.exercise_minutes} min`
                : "--"}
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="heading-records">☀️ Daily Check-In</h2>

          <form onSubmit={handleSaveCheckin} className="form section" noValidate>
            <label className="field">
              Date
              <input
                type="date"
                value={checkinDate}
                onChange={(e) => setCheckinDate(e.target.value)}
                required
                className="input"
              />
            </label>

            <label className="field">
              Sleep hours
              <input
                type="number"
                step="any"
                min="0"
                max="24"
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                className="input"
              />
            </label>

            <label className="field">
              Water cups
              <input
                type="number"
                step="1"
                min="0"
                value={waterCups}
                onChange={(e) => setWaterCups(e.target.value)}
                className="input"
              />
            </label>

            <label className="field">
              Exercise minutes
              <input
                type="number"
                step="1"
                min="0"
                value={exerciseMinutes}
                onChange={(e) => setExerciseMinutes(e.target.value)}
                className="input"
              />
            </label>

            <div className="field">
              Mood
              <div className="mood-options">
                {MOOD_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMood(mood === option ? "" : option)}
                    className={`btn btn-mood ${mood === option ? "btn-mood-selected" : ""}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className="field">
              Notes
              <textarea
                value={checkinNotes}
                onChange={(e) => setCheckinNotes(e.target.value)}
                rows={4}
                className="input"
              />
            </label>

            <button type="submit" disabled={checkinSaving} className="btn btn-save">
              {checkinSaving ? "Saving..." : "Save Check-In"}
            </button>
          </form>

          {checkinStatus && (
            <p
              className={`message ${
                checkinStatus.type === "success" ? "message-success" : "message-error"
              }`}
            >
              {checkinStatus.message}
            </p>
          )}

          <div className="section">
            <h3 className="heading-records">Recent Check-Ins</h3>

            {checkinListError && <p className="message message-error">{checkinListError}</p>}

            {checkinDeleteStatus && (
              <p
                className={`message ${
                  checkinDeleteStatus.type === "success" ? "message-success" : "message-error"
                }`}
              >
                {checkinDeleteStatus.message}
              </p>
            )}

            {checkinUpdateStatus && (
              <p
                className={`message ${
                  checkinUpdateStatus.type === "success" ? "message-success" : "message-error"
                }`}
              >
                {checkinUpdateStatus.message}
              </p>
            )}

            {!checkinListError && !loadingCheckins && checkins.length === 0 && (
              <p className="empty-text">No check-ins yet.</p>
            )}

            {!checkinListError && checkins.length > 0 && (
              <ul className="records-list">
                {checkins.map((checkin) => (
                  <li key={checkin.id} className="record-card">
                    {editingCheckinId === checkin.id ? (
                      <div className="form">
                        <label className="field">
                          Date
                          <input
                            type="date"
                            value={editCheckinDate}
                            onChange={(e) => setEditCheckinDate(e.target.value)}
                            className="input"
                          />
                        </label>
                        <label className="field">
                          Sleep hours
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max="24"
                            value={editSleepHours}
                            onChange={(e) => setEditSleepHours(e.target.value)}
                            className="input"
                          />
                        </label>
                        <label className="field">
                          Water cups
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={editWaterCups}
                            onChange={(e) => setEditWaterCups(e.target.value)}
                            className="input"
                          />
                        </label>
                        <label className="field">
                          Exercise minutes
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={editExerciseMinutes}
                            onChange={(e) => setEditExerciseMinutes(e.target.value)}
                            className="input"
                          />
                        </label>
                        <div className="field">
                          Mood
                          <div className="mood-options">
                            {MOOD_OPTIONS.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() =>
                                  setEditMood(editMood === option ? "" : option)
                                }
                                className={`btn btn-mood ${
                                  editMood === option ? "btn-mood-selected" : ""
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="field">
                          Notes
                          <textarea
                            value={editCheckinNotes}
                            onChange={(e) => setEditCheckinNotes(e.target.value)}
                            rows={4}
                            className="input"
                          />
                        </label>
                        <div className="record-actions">
                          <button
                            onClick={() => handleUpdateCheckin(checkin.id)}
                            className="btn btn-save"
                          >
                            Save Changes
                          </button>
                          <button onClick={handleCheckinCancelEdit} className="btn btn-cancel">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="record-row">
                          <strong>Date:</strong> {checkin.checkin_date}
                        </div>
                        <div className="record-row">
                          <strong>Sleep:</strong>{" "}
                          {typeof checkin.sleep_hours === "number"
                            ? `${checkin.sleep_hours} hrs`
                            : "--"}
                        </div>
                        <div className="record-row">
                          <strong>Water:</strong>{" "}
                          {typeof checkin.water_cups === "number"
                            ? `${checkin.water_cups} cups`
                            : "--"}
                        </div>
                        <div className="record-row">
                          <strong>Exercise:</strong>{" "}
                          {typeof checkin.exercise_minutes === "number"
                            ? `${checkin.exercise_minutes} min`
                            : "--"}
                        </div>
                        <div className="record-row">
                          <strong>Mood:</strong> {checkin.mood ?? "--"}
                        </div>
                        <div className="record-row">
                          <strong>Notes:</strong> {checkin.notes}
                        </div>
                        <div className="record-actions">
                          <button
                            onClick={() => handleCheckinEditClick(checkin)}
                            className="btn btn-edit"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCheckin(checkin.id)}
                            className="btn btn-delete"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Total Lab Results</div>
            <div className="summary-value">{totalLabResults}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Latest Test</div>
            <div className="summary-value">{latestLabResult?.test_name ?? "--"}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Latest Test Date</div>
            <div className="summary-value">{latestLabResult?.test_date ?? "--"}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Out-of-Range Results</div>
            <div className="summary-value">{outOfRangeLabCount}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Tests Tracked</div>
            <div className="summary-value">{labTestsTracked}</div>
          </div>
        </div>

        <div className="card">
          <h2 className="heading-records">🩸 Lab Results</h2>
          <p className="hint-text">
            Status is a simple comparison against the reference range you enter — not a diagnosis.
          </p>

          <form onSubmit={handleSaveLabResult} className="form section" noValidate>
            <label className="field">
              Test Date
              <input
                type="date"
                value={labTestDate}
                onChange={(e) => setLabTestDate(e.target.value)}
                className="input"
              />
            </label>

            <div className="field">
              Test Name
              {favoriteTestNames.length > 0 && (
                <>
                  <span className="hint-text">⭐ Favorites</span>
                  <div className="chip-options">
                    {favoriteTestNames.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => applyLabTestNameChange(name)}
                        className={`btn btn-chip ${labTestName === name ? "btn-chip-selected" : ""}`}
                      >
                        ⭐ {name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="chip-options">
                {QUICK_TEST_NAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => applyLabTestNameChange(name)}
                    className={`btn btn-chip ${labTestName === name ? "btn-chip-selected" : ""}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="lab-test-name-row">
                <input
                  type="text"
                  value={labTestName}
                  onChange={(e) => applyLabTestNameChange(e.target.value)}
                  placeholder="Or type a custom test name"
                  className="input"
                />
                <button
                  type="button"
                  onClick={() => handleToggleFavoriteTest(labTestName)}
                  disabled={labTestName.trim() === ""}
                  className="btn btn-cancel"
                >
                  {favoriteTestNames.includes(labTestName.trim()) ? "★ Favorited" : "☆ Favorite"}
                </button>
              </div>
            </div>

            <label className="field">
              Category
              <select
                value={labCategory}
                onChange={(e) => setLabCategory(e.target.value)}
                className="input"
              >
                <option value="">No category</option>
                {LAB_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Result
              <input
                type="number"
                step="any"
                value={labResultValue}
                onChange={(e) => setLabResultValue(e.target.value)}
                className="input"
              />
            </label>

            <label className="field">
              Unit
              <input
                type="text"
                value={labUnit}
                onChange={(e) => handleLabUnitChange(e.target.value)}
                placeholder="e.g. K/uL, ng/mL"
                className="input"
              />
            </label>

            <p className="hint-text">
              Suggested range only. Use the reference range printed on your laboratory report.
            </p>

            <label className="field">
              Reference Low
              <input
                type="number"
                step="any"
                value={labReferenceLow}
                onChange={(e) => {
                  setLabReferenceLow(e.target.value);
                  setLabRangeSource("custom");
                }}
                className="input"
              />
            </label>

            <label className="field">
              Reference High
              <input
                type="number"
                step="any"
                value={labReferenceHigh}
                onChange={(e) => {
                  setLabReferenceHigh(e.target.value);
                  setLabRangeSource("custom");
                }}
                className="input"
              />
            </label>

            <div className="goal-actions">
              <button type="button" onClick={handleUseSuggestedRange} className="btn btn-chip">
                Use suggested range
              </button>
              <button type="button" onClick={handleClearLabRange} className="btn btn-cancel">
                Clear range
              </button>
            </div>

            <label className="field">
              Lab Name
              <input
                type="text"
                value={labLabName}
                onChange={(e) => setLabLabName(e.target.value)}
                className="input"
              />
            </label>

            <label className="field">
              Notes
              <textarea
                value={labNotes}
                onChange={(e) => setLabNotes(e.target.value)}
                rows={4}
                className="input"
              />
            </label>

            <button type="submit" disabled={labSaving} className="btn btn-save">
              {labSaving ? "Saving..." : "Save Lab Result"}
            </button>
          </form>

          {labStatus && (
            <p
              className={`message ${
                labStatus.type === "success" ? "message-success" : "message-error"
              }`}
            >
              {labStatus.message}
            </p>
          )}

          <div className="section">
            <h3 className="heading-records">Filter & Search</h3>
            <div className="lab-filters">
              <label className="field">
                Test Name
                <select
                  value={labFilterTestName}
                  onChange={(e) => setLabFilterTestName(e.target.value)}
                  className="input"
                >
                  <option value="">All tests</option>
                  {distinctLabTestNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Category
                <select
                  value={labFilterCategory}
                  onChange={(e) => setLabFilterCategory(e.target.value)}
                  className="input"
                >
                  <option value="">All categories</option>
                  {LAB_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Start Date
                <input
                  type="date"
                  value={labFilterStartDate}
                  onChange={(e) => setLabFilterStartDate(e.target.value)}
                  className="input"
                />
              </label>

              <label className="field">
                End Date
                <input
                  type="date"
                  value={labFilterEndDate}
                  onChange={(e) => setLabFilterEndDate(e.target.value)}
                  className="input"
                />
              </label>

              <label className="field">
                Search
                <input
                  type="text"
                  value={labSearchQuery}
                  onChange={(e) => setLabSearchQuery(e.target.value)}
                  placeholder="Search test, category, lab, notes"
                  className="input"
                />
              </label>
            </div>
          </div>

          <div className="section">
            <h3 className="heading-records">📈 Lab Trend</h3>
            <label className="field">
              Test
              <select
                value={selectedChartTest}
                onChange={(e) => setSelectedChartTest(e.target.value)}
                className="input"
              >
                <option value="">Choose a test</option>
                {distinctLabTestNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            {selectedChartTest === "" ? (
              <p className="empty-text section">Choose a test above to see its trend.</p>
            ) : chartDataPoints.length < 2 ? (
              <p className="empty-text section">
                Add at least 2 "{selectedChartTest}" results to see a trend.
              </p>
            ) : (
              <div className="chart-wrapper">
                <p className="hint-text">
                  {selectedChartTest}
                  {chartUnit ? ` (${chartUnit})` : ""}
                </p>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartDataPoints}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6eaf0" />
                    <XAxis
                      dataKey="test_date"
                      tickFormatter={formatLabDate}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => [value, selectedChartTest]}
                      labelFormatter={formatLabDate}
                    />
                    {chartReferenceLow !== null && (
                      <ReferenceLine
                        y={chartReferenceLow}
                        stroke="#e0453c"
                        strokeDasharray="4 4"
                        label={{ value: "Low", fontSize: 11, fill: "#e0453c" }}
                      />
                    )}
                    {chartReferenceHigh !== null && (
                      <ReferenceLine
                        y={chartReferenceHigh}
                        stroke="#e0453c"
                        strokeDasharray="4 4"
                        label={{ value: "High", fontSize: 11, fill: "#e0453c" }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="result_value"
                      stroke="#2f6feb"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="section">
            <h3 className="heading-records">Lab History</h3>

            {labListError && <p className="message message-error">{labListError}</p>}

            {labDeleteStatus && (
              <p
                className={`message ${
                  labDeleteStatus.type === "success" ? "message-success" : "message-error"
                }`}
              >
                {labDeleteStatus.message}
              </p>
            )}

            {labUpdateStatus && (
              <p
                className={`message ${
                  labUpdateStatus.type === "success" ? "message-success" : "message-error"
                }`}
              >
                {labUpdateStatus.message}
              </p>
            )}

            {!labListError && !loadingLabResults && labResults.length === 0 && (
              <p className="empty-text">No lab results yet.</p>
            )}

            {!labListError &&
              labResults.length > 0 &&
              filteredLabResults.length === 0 && (
                <p className="empty-text">No lab results match your filters.</p>
              )}

            {!labListError && filteredLabResults.length > 0 && (
              <ul className="records-list">
                {filteredLabResults.map((lab) => (
                  <li key={lab.id} className="record-card">
                    {editingLabId === lab.id ? (
                      <div className="form">
                        <label className="field">
                          Test Date
                          <input
                            type="date"
                            value={editLabTestDate}
                            onChange={(e) => setEditLabTestDate(e.target.value)}
                            className="input"
                          />
                        </label>

                        <div className="field">
                          Test Name
                          {favoriteTestNames.length > 0 && (
                            <>
                              <span className="hint-text">⭐ Favorites</span>
                              <div className="chip-options">
                                {favoriteTestNames.map((name) => (
                                  <button
                                    key={name}
                                    type="button"
                                    onClick={() => applyEditLabTestNameChange(name)}
                                    className={`btn btn-chip ${
                                      editLabTestName === name ? "btn-chip-selected" : ""
                                    }`}
                                  >
                                    ⭐ {name}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                          <div className="chip-options">
                            {QUICK_TEST_NAMES.map((name) => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => applyEditLabTestNameChange(name)}
                                className={`btn btn-chip ${
                                  editLabTestName === name ? "btn-chip-selected" : ""
                                }`}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                          <div className="lab-test-name-row">
                            <input
                              type="text"
                              value={editLabTestName}
                              onChange={(e) => applyEditLabTestNameChange(e.target.value)}
                              className="input"
                            />
                            <button
                              type="button"
                              onClick={() => handleToggleFavoriteTest(editLabTestName)}
                              disabled={editLabTestName.trim() === ""}
                              className="btn btn-cancel"
                            >
                              {favoriteTestNames.includes(editLabTestName.trim())
                                ? "★ Favorited"
                                : "☆ Favorite"}
                            </button>
                          </div>
                        </div>

                        <label className="field">
                          Category
                          <select
                            value={editLabCategory}
                            onChange={(e) => setEditLabCategory(e.target.value)}
                            className="input"
                          >
                            <option value="">No category</option>
                            {LAB_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field">
                          Result
                          <input
                            type="number"
                            step="any"
                            value={editLabResultValue}
                            onChange={(e) => setEditLabResultValue(e.target.value)}
                            className="input"
                          />
                        </label>

                        <label className="field">
                          Unit
                          <input
                            type="text"
                            value={editLabUnit}
                            onChange={(e) => handleEditLabUnitChange(e.target.value)}
                            className="input"
                          />
                        </label>

                        <p className="hint-text">
                          Suggested range only. Use the reference range printed on your laboratory
                          report.
                        </p>

                        <label className="field">
                          Reference Low
                          <input
                            type="number"
                            step="any"
                            value={editLabReferenceLow}
                            onChange={(e) => {
                              setEditLabReferenceLow(e.target.value);
                              setEditLabRangeSource("custom");
                            }}
                            className="input"
                          />
                        </label>

                        <label className="field">
                          Reference High
                          <input
                            type="number"
                            step="any"
                            value={editLabReferenceHigh}
                            onChange={(e) => {
                              setEditLabReferenceHigh(e.target.value);
                              setEditLabRangeSource("custom");
                            }}
                            className="input"
                          />
                        </label>

                        <div className="goal-actions">
                          <button
                            type="button"
                            onClick={handleUseSuggestedRangeEdit}
                            className="btn btn-chip"
                          >
                            Use suggested range
                          </button>
                          <button
                            type="button"
                            onClick={handleClearLabRangeEdit}
                            className="btn btn-cancel"
                          >
                            Clear range
                          </button>
                        </div>

                        <label className="field">
                          Lab Name
                          <input
                            type="text"
                            value={editLabLabName}
                            onChange={(e) => setEditLabLabName(e.target.value)}
                            className="input"
                          />
                        </label>

                        <label className="field">
                          Notes
                          <textarea
                            value={editLabNotes}
                            onChange={(e) => setEditLabNotes(e.target.value)}
                            rows={4}
                            className="input"
                          />
                        </label>

                        <div className="record-actions">
                          <button
                            onClick={() => handleUpdateLabResult(lab.id)}
                            className="btn btn-save"
                          >
                            Save Changes
                          </button>
                          <button onClick={handleLabCancelEdit} className="btn btn-cancel">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="record-row">
                          <strong>Date:</strong> {lab.test_date}
                        </div>
                        <div className="record-row">
                          <strong>Test:</strong> {lab.test_name}
                        </div>
                        <div className="record-row">
                          <strong>Result:</strong> {lab.result_value}
                          {lab.unit ? ` ${lab.unit}` : ""}
                        </div>
                        <div className="record-row">
                          <strong>Reference Range:</strong>{" "}
                          {lab.reference_low !== null && lab.reference_high !== null
                            ? `${lab.reference_low} - ${lab.reference_high}${
                                lab.unit ? ` ${lab.unit}` : ""
                              }`
                            : "--"}
                          {isLabResultCustomRange(lab) && (
                            <span className="lab-custom-badge">Custom range</span>
                          )}
                        </div>
                        <div className="record-row">
                          <strong>Status:</strong>{" "}
                          <span className={labStatusClass(lab.status)}>{lab.status}</span>
                        </div>
                        <div className="record-row">
                          <strong>Category:</strong> {lab.category ?? "--"}
                        </div>
                        <div className="record-row">
                          <strong>Lab Name:</strong> {lab.lab_name ?? "--"}
                        </div>
                        <div className="record-row">
                          <strong>Notes:</strong> {lab.notes}
                        </div>
                        <div className="record-actions">
                          <button
                            onClick={() => handleLabEditClick(lab)}
                            className="btn btn-edit"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteLabResult(lab.id)}
                            className="btn btn-delete"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <AiCoachCard
          records={records}
          goalWeight={savedGoal}
          checkins={checkins}
          labResults={labResults}
        />

        <AiChatCard
          records={records}
          goalWeight={savedGoal}
          checkins={checkins}
          labResults={labResults}
        />

        <div className="card">
          <h2 className="heading-records">📈 Weight Trend</h2>

          {chartData.length < 2 ? (
            <p className="empty-text">Add at least 2 records to see your weight trend.</p>
          ) : (
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6eaf0" />
                  <XAxis
                    dataKey="record_date"
                    tickFormatter={formatMonthDay}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [value, "Weight"]}
                    labelFormatter={formatMonthDay}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#2f6feb"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="heading-records">Add Record</h2>

          <form onSubmit={handleSave} className="form section">
            <label className="field">
              Date
              <input
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
                required
                className="input"
              />
            </label>

            <label className="field">
              Weight
              <input
                type="number"
                step="any"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
                className="input"
              />
            </label>

            <label className="field">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="input"
              />
            </label>

            <button type="submit" disabled={saving} className="btn btn-save">
              {saving ? "Saving..." : "Save"}
            </button>
          </form>

          {status && (
            <p className={`message ${status.type === "success" ? "message-success" : "message-error"}`}>
              {status.message}
            </p>
          )}
        </div>

        <div className="card">
          <h2 className="heading-records">Health Records</h2>

          {listError && <p className="message message-error">{listError}</p>}

          {deleteStatus && (
            <p className={`message ${deleteStatus.type === "success" ? "message-success" : "message-error"}`}>
              {deleteStatus.message}
            </p>
          )}

          {updateStatus && (
            <p className={`message ${updateStatus.type === "success" ? "message-success" : "message-error"}`}>
              {updateStatus.message}
            </p>
          )}

          {!listError && !loadingRecords && records.length === 0 && (
            <p className="empty-text">No records yet.</p>
          )}

          {!listError && records.length > 0 && (
            <ul className="records-list">
              {records.map((record) => (
                <li key={record.id} className="record-card">
                  {editingId === record.id ? (
                    <div className="form">
                      <label className="field">
                        Date
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="input"
                        />
                      </label>
                      <label className="field">
                        Weight
                        <input
                          type="number"
                          step="any"
                          value={editWeight}
                          onChange={(e) => setEditWeight(e.target.value)}
                          className="input"
                        />
                      </label>
                      <label className="field">
                        Notes
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={4}
                          className="input"
                        />
                      </label>
                      <div className="record-actions">
                        <button onClick={() => handleUpdate(record.id)} className="btn btn-save">
                          Save Changes
                        </button>
                        <button onClick={handleCancelEdit} className="btn btn-cancel">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="record-row"><strong>Date:</strong> {record.record_date}</div>
                      <div className="record-row"><strong>Weight:</strong> {record.weight}</div>
                      <div className="record-row"><strong>Notes:</strong> {record.notes}</div>
                      <div className="record-actions">
                        <button onClick={() => handleEditClick(record)} className="btn btn-edit">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(record.id)} className="btn btn-delete">
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
