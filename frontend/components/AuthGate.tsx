"use client";

import React, { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, loginUser } = useAuth();
  const [email, setEmail] = useState("raj@assetflow.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loginUser(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-text-muted font-extrabold text-sm select-none">
        <div className="flex flex-col items-center gap-3">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-mathical-pink border-t-transparent" />
          <span>Loading AssetFlow...</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 py-6 font-sans">
        <Card className="w-full max-w-md bg-[#090a09] border border-white/5 rounded-[2.2rem] p-8 shadow-2xl">
          <p className="font-heading text-4xl font-extrabold tracking-tighter text-mathical-pink lowercase text-center">
            assetflow
          </p>
          <h1 className="mt-4 text-xl font-bold text-white text-center tracking-tight">
            Sign in to continue
          </h1>
          <p className="mt-2 text-xs text-text-muted text-center leading-relaxed font-medium">
            Use a seeded account such as{" "}
            <span className="text-stone-300 font-bold">raj@assetflow.com</span> or{" "}
            <span className="text-stone-300 font-bold">alice@assetflow.com</span> /{" "}
            <span className="text-stone-300 font-bold">password123</span>.
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-warning font-bold">{error}</p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              isLoading={submitting}
            >
              Sign in
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}
