"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  AuthField,
  AuthNotice,
  AuthShell,
  AuthSubmit,
} from "@/components/auth/auth-form";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_SERVER_ERROR =
  "We could not sign you in right now. Please try again shortly.";

interface LoginErrors {
  email?: string;
  password?: string;
}

type LoginStatus = "idle" | "submitting" | "success" | "error";

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

/** 5xx never surfaces the server's wording, only a generic line. */
function messageForStatus(status: number, payload: unknown): string {
  if (status >= 500) return GENERIC_SERVER_ERROR;
  if (status === 401) {
    return readErrorMessage(payload) ?? "Invalid email or password.";
  }
  if (status === 400) {
    return (
      readErrorMessage(payload) ?? "Please check your details and try again."
    );
  }
  return readErrorMessage(payload) ?? GENERIC_SERVER_ERROR;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [status, setStatus] = useState<LoginStatus>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);

  const isSubmitting = status === "submitting";
  // Stays locked through the redirect so the form cannot be submitted twice.
  const isLocked = isSubmitting || status === "success";

  const validate = (): LoginErrors => {
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
      // The password goes here and nowhere else — no storage, no URL, no cookie.
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus("error");
        setNotice({
          tone: "error",
          message: messageForStatus(response.status, payload),
        });
        return;
      }

      // The server set the session cookie; drop the password immediately.
      setPassword("");
      setStatus("success");
      setNotice({ tone: "success", message: "Signed in. Taking you through." });

      router.replace("/interview");
      // Re-fetch server components so they see the new session cookie.
      router.refresh();
    } catch {
      setStatus("error");
      setNotice({
        tone: "error",
        message: "Unable to connect. Please try again.",
      });
    }
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

          <AuthSubmit>
            {isSubmitting
              ? "Logging in..."
              : status === "success"
                ? "Signed in"
                : "Log in"}
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
