import { useState } from "react";
import { supabase } from "../supabase";

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(null); // { type: "success" | "error", message: string }
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (email.trim() === "") return "Email is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return null;
  };

  const handleSignIn = async (e) => {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }

    setStatus(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      setStatus({ type: "error", message: error.message });
    }
    // On success the onAuthStateChange listener in App.jsx picks up the new session.
  };

  const handleSignUp = async () => {
    const validationError = validate();
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }

    setStatus(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      setStatus({ type: "error", message: error.message });
      return;
    }

    if (data.session) {
      setStatus({ type: "success", message: "Account created! You're signed in." });
    } else {
      setStatus({
        type: "success",
        message: "Account created! Check your email to confirm your address, then sign in.",
      });
    }
  };

  return (
    <div className="page">
      <div className="dashboard">
        <div className="card auth-card">
          <h1 className="dashboard-title">❤️ Health MPV</h1>
          <p className="dashboard-subtitle">Sign in or create an account to continue.</p>

          <form onSubmit={handleSignIn} className="form section" noValidate>
            <label className="field">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                autoComplete="email"
              />
            </label>

            <label className="field">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
              />
            </label>
            <p className="hint-text">Password must be at least 8 characters.</p>

            <div className="goal-actions">
              <button type="submit" disabled={loading} className="btn btn-save">
                {loading ? "Please wait..." : "Sign In"}
              </button>
              <button
                type="button"
                onClick={handleSignUp}
                disabled={loading}
                className="btn btn-cancel"
              >
                {loading ? "Please wait..." : "Sign Up"}
              </button>
            </div>
          </form>

          {status && (
            <p
              className={`message ${
                status.type === "success" ? "message-success" : "message-error"
              }`}
            >
              {status.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
