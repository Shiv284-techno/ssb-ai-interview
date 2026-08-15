"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import {
  AuthField,
  AuthNotice,
  AuthShell,
  AuthSubmit,
} from "@/components/auth/auth-form";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: LoginErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    }

    setErrors(nextErrors);
    setNotice(
      Object.keys(nextErrors).length === 0
        ? "Sign-in is not connected yet. Authentication arrives in the next step."
        : null,
    );
  };

  return (
    <AuthShell
      badge="Sign in"
      title="Welcome back"
      description="Sign in to continue to your interview room."
      footer={
        <>
          No account yet?{" "}
          <Link
            href="/signup"
            className="font-medium text-emerald-300 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            Create one
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />

        <AuthSubmit>Log in</AuthSubmit>

        {notice && <AuthNotice>{notice}</AuthNotice>}
      </form>
    </AuthShell>
  );
}
