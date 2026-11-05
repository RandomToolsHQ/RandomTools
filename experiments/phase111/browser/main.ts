import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
declare const PHASE111_FIREBASE_CONFIG: {
  projectId: string;
  [key: string]: unknown;
};
if (PHASE111_FIREBASE_CONFIG.projectId !== "randomtools-supabase-auth-poc")
  throw Error("Isolated project required");
const auth = initializeAuth(initializeApp(PHASE111_FIREBASE_CONFIG), {
  persistence: inMemoryPersistence,
});
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const status = element("status"),
  error = element("error"),
  result = element("result");
let busy = false,
  lastId = "",
  ready = false;
function controls() {
  for (const id of ["account", "workspace", "admin", "save", "logout"])
    element<HTMLButtonElement>(id).disabled = busy || !ready;
  element<HTMLButtonElement>("remove").disabled = busy || !ready || !lastId;
  element<HTMLButtonElement>("signin").disabled = busy;
}
async function api(operation: string, body: unknown = {}) {
  if (!auth.currentUser) throw Error("Sign-in required.");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch("/api/phase11", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ operation, body }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error(
      response.status === 403
        ? "Permission denied (403)."
        : response.status === 401
          ? "Session denied (401)."
          : response.status === 429
            ? "Rate limited. Try again later."
            : "Testing service unavailable (" + response.status + ").",
    );
  return response.json();
}
async function action(fn: () => Promise<void>) {
  if (busy) return;
  busy = true;
  error.textContent = "";
  result.textContent = "";
  status.textContent = "Working…";
  controls();
  try {
    await fn();
  } catch (e) {
    error.textContent =
      e instanceof Error &&
      /^(Permission denied|Session denied|Sign-in required|Rate limited|Testing service unavailable)/.test(
        e.message,
      )
        ? e.message
        : "Authentication or testing request failed.";
    status.textContent = "Test did not complete.";
  } finally {
    busy = false;
    controls();
  }
}
element<HTMLFormElement>("login").addEventListener("submit", (event) => {
  event.preventDefault();
  void action(async () => {
    const email = element<HTMLInputElement>("email").value.trim();
    if (!/^phase11-[a-f0-9-]+-(admin|member|other)@example\.com$/.test(email))
      throw Error("Sign-in required. Use a recorded synthetic account.");
    const password = element<HTMLInputElement>("password");
    try {
      await signInWithEmailAndPassword(auth, email, password.value);
      await api("session");
      result.textContent = JSON.stringify(await api("me"), null, 2);
      ready = true;
      status.textContent = "Authenticated application session established.";
    } catch (e) {
      ready = false;
      await signOut(auth);
      throw e;
    } finally {
      password.value = "";
    }
  });
});
for (const [id, operation] of [
  ["account", "me"],
  ["workspace", "workspace"],
  ["admin", "admin"],
])
  element(id).addEventListener(
    "click",
    () =>
      void action(async () => {
        result.textContent = JSON.stringify(await api(operation), null, 2);
        status.textContent = "Request completed.";
      }),
  );
element("save").addEventListener(
  "click",
  () =>
    void action(async () => {
      const data = await api("save", {
        name: "Browser synthetic " + crypto.randomUUID(),
        data: { text: "Synthetic browser fixture" },
      });
      if (
        !data ||
        typeof data !== "object" ||
        !("id" in data) ||
        typeof data.id !== "string"
      )
        throw Error("Testing service unavailable. Invalid preset response.");
      lastId = data.id;
      result.textContent = JSON.stringify(data);
      status.textContent = "Synthetic preset created.";
    }),
);
element("remove").addEventListener(
  "click",
  () =>
    void action(async () => {
      await api("delete", { id: lastId });
      lastId = "";
      status.textContent = "Created preset removed.";
    }),
);
element("logout").addEventListener(
  "click",
  () =>
    void action(async () => {
      try {
        await api("logout");
      } catch {
        throw Error(
          "Testing service unavailable. Server logout was not confirmed.",
        );
      } finally {
        ready = false;
        await signOut(auth);
        lastId = "";
        result.textContent = "";
        element<HTMLInputElement>("password").value = "";
      }
      status.textContent = "Logged out; server session revoked.";
    }),
);
