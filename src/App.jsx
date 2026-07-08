import { useEffect, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";

function App() {
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

  const fetchRecords = async () => {
    setLoadingRecords(true);
    const { data, error } = await supabase
      .from("health_records")
      .select("*")
      .order("record_date", { ascending: false });

    if (error) {
      setListError(error.message);
    } else {
      setListError(null);
      setRecords(data);
    }
    setLoadingRecords(false);
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    const { error } = await supabase.from("health_records").insert([
      {
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
    const { error } = await supabase.from("health_records").delete().eq("id", id);

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

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Health MPV</h1>
      <p>My first AI Health App 🚀</p>

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Date
          <input
            type="date"
            value={recordDate}
            onChange={(e) => setRecordDate(e.target.value)}
            required
            style={{ display: "block", width: "100%" }}
          />
        </label>

        <label>
          Weight
          <input
            type="number"
            step="any"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            required
            style={{ display: "block", width: "100%" }}
          />
        </label>

        <label>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            style={{ display: "block", width: "100%" }}
          />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </form>

      {status && (
        <p style={{ color: status.type === "success" ? "green" : "red" }}>
          {status.message}
        </p>
      )}

      <h2>Health Records</h2>

      {listError && <p style={{ color: "red" }}>{listError}</p>}

      {deleteStatus && (
        <p style={{ color: deleteStatus.type === "success" ? "green" : "red" }}>
          {deleteStatus.message}
        </p>
      )}

      {updateStatus && (
        <p style={{ color: updateStatus.type === "success" ? "green" : "red" }}>
          {updateStatus.message}
        </p>
      )}

      {!listError && !loadingRecords && records.length === 0 && (
        <p>No records yet.</p>
      )}

      {!listError && records.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {records.map((record) => (
            <li key={record.id} style={{ border: "1px solid #ccc", borderRadius: 6, padding: 12 }}>
              {editingId === record.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label>
                    Date
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      style={{ display: "block", width: "100%" }}
                    />
                  </label>
                  <label>
                    Weight
                    <input
                      type="number"
                      step="any"
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      style={{ display: "block", width: "100%" }}
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={4}
                      style={{ display: "block", width: "100%" }}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleUpdate(record.id)}>Save Changes</button>
                    <button onClick={handleCancelEdit}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div><strong>Date:</strong> {record.record_date}</div>
                  <div><strong>Weight:</strong> {record.weight}</div>
                  <div><strong>Notes:</strong> {record.notes}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => handleEditClick(record)}>Edit</button>
                    <button onClick={() => handleDelete(record.id)}>Delete</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
