// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  return {
    loaded: false,
    userId: "first-user",
    getToken: vi.fn(),
    clerk: { signOut: vi.fn() },
  };
});
vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    isLoaded: state.loaded,
    userId: state.userId,
    getToken: state.getToken,
  }),
  useClerk: () => state.clerk,
  SignIn: () => <p>Provider sign in</p>,
  SignUp: () => <p>Provider sign up</p>,
}));
import { Authentication, managedSignOut } from "../src/auth";
import { api } from "../src/api";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("waits for Clerk, uses in-memory bearer tokens and clears cached account data on identity changes", async () => {
  const client = new QueryClient();
  const child = <p>Private application</p>;
  const tree = () => (
    <QueryClientProvider client={client}>
      <Authentication>{child}</Authentication>
    </QueryClientProvider>
  );
  const view = render(tree());
  expect(screen.getByRole("status").textContent).toContain("Loading");
  expect(screen.queryByText("Private application")).toBeNull();
  client.setQueryData(["private"], { owner: "first-user" });
  state.getToken.mockResolvedValue("synthetic-session-token");
  state.loaded = true;
  view.rerender(tree());
  await waitFor(() =>
    expect(screen.getByText("Private application")).toBeTruthy(),
  );
  expect(client.getQueryData(["private"])).toBeUndefined();
  const transport = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", transport);
  await api("/me");
  expect(transport).toHaveBeenCalledWith(
    "/api/me",
    expect.objectContaining({
      headers: { Authorization: "Bearer synthetic-session-token" },
      credentials: "same-origin",
    }),
  );
  expect(localStorage.length).toBe(0);
  client.setQueryData(["private"], { owner: "first-user" });
  state.userId = "second-user";
  view.rerender(tree());
  await waitFor(() => expect(client.getQueryData(["private"])).toBeUndefined());
  await managedSignOut();
  expect(state.clerk.signOut).toHaveBeenCalled();
});
