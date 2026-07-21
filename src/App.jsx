import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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

const goalStorageKey = (userId) => `healthMpvGoalWeight_${userId}`;

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
    } else {
      setRecords([]);
      setCheckins([]);
      setListError(null);
      setCheckinListError(null);
      setLoadingRecords(false);
      setLoadingCheckins(false);
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

        <AiCoachCard records={records} goalWeight={savedGoal} checkins={checkins} />

        <AiChatCard records={records} goalWeight={savedGoal} checkins={checkins} />

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
