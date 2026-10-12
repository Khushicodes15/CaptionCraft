import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, ArrowLeft, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CaptionCraft" },
      { name: "description", content: "Sign in to CaptionCraft to caption and style your videos." },
      { property: "og:title", content: "Sign in — CaptionCraft" },
      { property: "og:description", content: "Sign in to caption and style your videos." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [sentConfirmation, setSentConfirmation] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  async function handleEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setSentConfirmation(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/app" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResendConfirmation() {
    if (!email) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      toast.success("Confirmation email resent! Please check your inbox and spam folder.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend confirmation email.");
    } finally {
      setResending(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/app`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      setBusy(false);
      toast.error(
        error?.message ||
          "Google sign-in is not enabled in your Supabase project yet. Please use email & password or enable the Google provider in Supabase."
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-xl">
        <Link to="/" className="text-lg font-black tracking-tight">
          Caption<span className="text-primary">Craft</span>
        </Link>

        {sentConfirmation ? (
          <div className="mt-6 space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Check your email</h1>
              <p className="text-sm text-muted-foreground">
                We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <p>• Check your <strong>Spam</strong> or <strong>Junk</strong> folder.</p>
              <p>• If you don't receive it, disable <strong>"Confirm email"</strong> in your Supabase dashboard (Authentication → Providers → Email) for instant login without emails.</p>
            </div>

            <div className="space-y-2 pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResendConfirmation}
                disabled={resending}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${resending ? "animate-spin" : ""}`} />
                {resending ? "Resending..." : "Resend confirmation email"}
              </Button>

              <Button
                variant="ghost"
                className="w-full text-sm text-muted-foreground"
                onClick={() => {
                  setSentConfirmation(false);
                  setMode("signin");
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>

            <form className="mt-6 space-y-4" onSubmit={handleEmail}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {mode === "signin" ? "Sign in" : "Sign up"}
              </Button>
            </form>

            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={handleGoogle}
              disabled={busy}
            >
              Continue with Google
            </Button>

            <button
              type="button"
              className="mt-6 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "No account yet? Sign up" : "Already have an account? Sign in"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
