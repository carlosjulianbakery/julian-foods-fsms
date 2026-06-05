"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Invalid email or password. Please try again.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-4">
      {/* Card */}
      <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">

        {/* Brand header */}
        <div className="bg-[#D64D4D] px-8 py-8 text-center">
          <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 shadow-md">
            <Image src="/icon-512.png" alt="Julian Bakery" width={64} height={64} className="w-full h-full object-cover" priority />
          </div>
          <h1 className="text-2xl font-bold text-white font-garamond tracking-tight">
            Julian Bakery
          </h1>
          <p className="text-xs text-white/70 font-mono mt-1">
            Food Safety Management System
          </p>
        </div>

        {/* Form */}
        <div className="px-8 py-7">
          <p className="text-sm font-mono text-gray-500 mb-5">Sign in to your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="you@julianbakery.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2.5 font-mono">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-2.5 mt-1" disabled={loading}>
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 font-mono mt-6 leading-relaxed">
            For access requests, contact your system administrator.
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 font-mono">
        &copy; {new Date().getFullYear()} Julian Bakery &mdash; Internal use only
      </p>
    </div>
  );
}
