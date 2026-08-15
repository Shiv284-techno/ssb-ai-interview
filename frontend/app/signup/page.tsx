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
const MIN_PASSWORD_LENGTH = 12;

interface SignupErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

type SignupStatus = "idle" | "submitting" | "success" | "error";

interface Notice {
  tone: "success" | "error";
  message: string;
}

/** Reads the route's safe `{ error }` message without trusting the shape. */
function readErrorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  const { error } = payload as { error?: unknown };
  return typeof error === "string" && error.length > 0 ? error : null;
}

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<SignupErrors>({});
  const [status, setStatus] = useState<SignupStatus>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);

  const isSubmitting = status === "submitting";
  // Stays locked after success so the same account cannot be submitted twice.
  const isLocked = isSubmitting || status === "success";

  const validate = (): SignupErrors => {
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
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Confirm your password.";
    } else if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    return nextErrors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLocked) return;

    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setNotice(null);
      setStatus("idle");
      return;
    }

    setStatus("submitting");
    setNotice(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus("error");
        setNotice({
          tone: "error",
          message:
            readErrorMessage(payload) ??
            "Could not create your account. Please try again.",
        });
        return;
      }

      // Clear the secrets as soon as they are no longer needed.
      setPassword("");
      setConfirmPassword("");
      setStatus("success");
      setNotice({
        tone: "success",
        message: `Account created for ${fullName.trim()}. You can sign in from the log in link below once sign-in is available.`,
      });
    } catch {
      setStatus("error");
      setNotice({
        tone: "error",
        message:
          "Could not reach the server. Check your connection and try again.",
      });
    }
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
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="mt-8"
      >
        {/* A disabled fieldset locks every control inside it, button included. */}
        <fieldset
          disabled={isLocked}
          className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0"
        >
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
            placeholder="At least 12 characters"
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

          <AuthSubmit>
            {isSubmitting
              ? "Creating account..."
              : status === "success"
                ? "Account created"
                : "Create account"}
          </AuthSubmit>
        </fieldset>

        {notice && (
          <div className="mt-5">
            <AuthNotice>
              <span
                className={
                  notice.tone === "error" ? "text-rose-300" : "text-emerald-300"
                }
              >
                {notice.message}
              </span>
            </AuthNotice>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
