import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from "@clerk/react";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setTokenProvider } from "./api";
export const managedAuth = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
let signOutProvider: (() => Promise<void>) | null = null;
export async function managedSignOut() {
  await signOutProvider?.();
}

function Bridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, userId } = useAuth();
  const clerk = useClerk();
  const client = useQueryClient();
  const [readyFor, setReadyFor] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    setTokenProvider(() => getToken());
    signOutProvider = async () => {
      await clerk.signOut();
      client.clear();
    };
    client.clear();
    setReadyFor(userId || "guest");
    return () => {
      setTokenProvider(null);
      signOutProvider = null;
    };
  }, [getToken, isLoaded, userId, client, clerk]);
  return isLoaded && readyFor === (userId || "guest") ? (
    children
  ) : (
    <p role="status">Loading secure account…</p>
  );
}
export function Authentication({ children }: { children: ReactNode }) {
  if (!managedAuth) return children;
  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      signInUrl="/login"
      signUpUrl="/register"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <Bridge>{children}</Bridge>
    </ClerkProvider>
  );
}
export function ManagedSignIn({ page }: { page: string }) {
  return (
    <section className="form-page">
      <h1>
        {page === "register" ? "Create your account" : "Your secure account"}
      </h1>
      {import.meta.env.VITE_DEPLOYMENT_STAGE === "staging" && (
        <p className="privacy">
          Staging preview. Test accounts only; do not store sensitive
          information.
        </p>
      )}
      {page === "register" ? (
        <SignUp routing="hash" />
      ) : (
        <SignIn routing="hash" />
      )}
    </section>
  );
}
export function ManagedSecurity() {
  const clerk = useClerk();
  return (
    <div className="panel">
      <h2>Account security</h2>
      <p>
        Manage your password, connected accounts and sessions through Clerk.
        Password recovery is available from the sign-in screen.
      </p>
      <button className="secondary" onClick={() => clerk.openUserProfile()}>
        Manage account security
      </button>
    </div>
  );
}
