"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { CardTitle, CardDescription, CardHeader, CardContent, CardFooter, Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authenticate, type AuthMode } from "@/lib/api-client";
import { MAX_EMAIL_LENGTH, MIN_PASSWORD_LENGTH, validateCredentials } from "@/lib/validation";
import { useUserStore } from "@/store/store";

const COPY: Record<AuthMode, { title: string; description: string; submit: string; busy: string }> = {
  login: {
    title: "Login",
    description: "Enter your email below to login to your account",
    submit: "Login",
    busy: "Logging in…",
  },
  signup: {
    title: "Sign up",
    description: "Enter your email and choose a password to create an account",
    submit: "Create account",
    busy: "Creating account…",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const setUserData = useUserStore((state) => state.setUserData);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = COPY[mode];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const check = validateCredentials({ email, password }, mode);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await authenticate(mode, check.value.email, check.value.password);
      setUserData(user.username, user.premium);
      toast.success(mode === "login" ? "Logged in successfully" : "Account created");
      setPassword("");
      router.push("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    setPassword("");
  }

  return (
    <div className="flex items-center min-h-screen p-6 mt-[-100px]">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="space-y-2">
          <Card>
            <form onSubmit={handleSubmit} noValidate>
              <CardHeader className="space-y-1">
                <CardTitle className="text-3xl font-bold">{copy.title}</CardTitle>
                <CardDescription>{copy.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    maxLength={MAX_EMAIL_LENGTH}
                    disabled={isSubmitting}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                    aria-describedby={mode === "signup" ? "password-hint" : undefined}
                    disabled={isSubmitting}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode === "signup" && (
                    <p id="password-hint" className="text-xs text-gray-500">
                      At least {MIN_PASSWORD_LENGTH} characters.
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                  {isSubmitting ? copy.busy : copy.submit}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
        <div className="text-center text-sm">
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button type="button" className="underline" onClick={switchMode} disabled={isSubmitting}>
            {mode === "login" ? "Sign up" : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
