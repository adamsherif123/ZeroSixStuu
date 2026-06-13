import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../authContext";
import { Navigate, useNavigate } from "react-router-dom";

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e.message || "Failed to sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white p-8 rounded-lg shadow-md w-96">
        <h2 className="text-xl font-bold mb-4">Admin Login</h2>
        {err && <div className="bg-red-50 text-red-700 text-sm p-2 rounded mb-3">{err}</div>}
        <input
          type="email"
          placeholder="Email"
          className="w-full border p-2 mb-3 rounded"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full border p-2 mb-4 rounded"
          value={pass}
          onChange={(e)=>setPass(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Signing in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
