"use client";

import { useState } from "react";
import { BookOpen, GraduationCap, LockKeyhole, Mail } from "lucide-react";

type User = { id: string; fullName: string; email: string; role: "student" };
const authImage = "/images/img4.jpg";

export function AuthGate({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.get("fullName"), email: form.get("email"), password: form.get("password") }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Authentication failed");
      onAuthenticated(payload.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not connect. Check the server and try again.");
    } finally { setBusy(false); }
  }

  return <main className="auth-shell auth-shell-split">
    <section className="auth-card auth-card-split">
      <div className="auth-panel-form">
        <div className="auth-brand"><span className="brand-mark"><BookOpen size={18} fill="currentColor"/></span>Cognify</div>
        <div className="auth-heading"><h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1><p>{mode === "login" ? "Sign in to continue your WAEC preparation." : "Save your courses and keep your study progress."}</p></div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && <label>Full name<input name="fullName" required minLength={2} maxLength={100} autoComplete="name" placeholder="Your name"/></label>}
          <label>Email address<span className="auth-input"><Mail size={15}/><input name="email" required type="email" maxLength={254} autoComplete="email" placeholder="you@example.com"/></span></label>
          <label>Password<span className="auth-input"><LockKeyhole size={15}/><input name="password" required minLength={mode === "register" ? 10 : 1} maxLength={128} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "At least 10 characters" : "Enter your password"}/></span></label>
          {error && <p className="study-form-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <p className="auth-switch">{mode === "login" ? "New to Cognify? " : "Already have an account? "}<button className="inline-link" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
        <div className="auth-divider"><span><GraduationCap size={14}/></span></div>
        <p className="demo-credentials"><LockKeyhole size={13}/> Your account and study progress are securely saved.</p>
      </div>
      <div className="auth-visual" aria-label="Study scene background" role="img">
        <div className="auth-visual-image is-active" aria-hidden="true" style={{ "--auth-scene": `url("${authImage}")` } as React.CSSProperties} />
      </div>
    </section>
  </main>;
}
