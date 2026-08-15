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

interface SignupErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<SignupErrors>({});
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: SignupErrors = {};
    const trimmedEmail = email.trim();

    if (!fullName.trim()) {
      nextErrors.fullName = "Full name is required.";
    }

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Confirm your password.";
    } else if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);
    setNotice(
      Object.keys(nextErrors).length === 0
        ? "Account creation is not connected yet. Authentication arrives in the next step."
        : null,
    );
  };

  return (
    <AuthShell
      badge="Create account"
      title="Join the board"
      description="Set up an account to keep your practice sessions in one place."
      footer={
        <>
          Already registered?{" "}
          <Link
            href="/login"
            className="font-medium text-emerald-300 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            Log in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <AuthField
          id="full-name"
          label="Full name"
          type="text"
          autoComplete="name"
          placeholder="As it appears on your records"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          error={errors.fullName}
        />

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
          autoComplete="new-password"
          placeholder="Choose a password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />

        <AuthField
          id="confirm-password"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
        />

        <AuthSubmit>Create account</AuthSubmit>

        {notice && <AuthNotice>{notice}</AuthNotice>}
      </form>
    </AuthShell>
  );
}
