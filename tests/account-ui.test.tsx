// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import Account from "../src/account";
import { api } from "../src/api";

vi.mock("../src/api", () => ({ api: vi.fn() }));
vi.mock("../src/auth", () => ({
  managedAuth: true,
  managedSignOut: vi.fn(),
  ManagedSignIn: () => null,
  ManagedSecurity: () => <p>Provider-managed security</p>,
}));
const owner = {
  id: "synthetic-owner",
  email: "owner@example.test",
  name: "Synthetic owner",
  role: "admin",
  verified: true,
};
const member = { ...owner, id: "synthetic-member", role: "free" };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount(page: string, admin = false) {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path === "/me") return { user: admin ? owner : member, pro: admin };
    if (path.startsWith("/admin?"))
      return {
        stats: { users: 1, pro: 1 },
        users: [owner],
        audit: [],
        usage: [],
      };
    if (path.startsWith("/admin/pro-access"))
      return { requests: [], grants: [] };
    return {};
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <Account page={page} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it("protects admin settings from accidental deletion and explains inherent Pro", async () => {
  mount("settings", true);
  await screen.findByRole("heading", { name: "Account settings" });
  expect(
    screen.queryByRole("button", { name: "Permanently delete account" }),
  ).toBeNull();
  expect(screen.getByText(/protected from self-deletion/)).toBeTruthy();
  expect(screen.getByText(/no scheduled expiry/)).toBeTruthy();
});
it("disables administrator account mutation controls in the admin UI", async () => {
  mount("admin", true);
  const button = (await screen.findByRole("button", {
    name: "Protected administrator",
  })) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Disable account" })).toBeNull();
});
it("requires the member to type deletion confirmation instead of supplying it silently", async () => {
  mount("settings");
  const input = (await screen.findByRole("textbox", {
    name: "Type DELETE to confirm",
  })) as HTMLInputElement;
  expect(input.required).toBe(true);
  expect(input.pattern).toBe("DELETE");
  fireEvent.change(input, { target: { value: "not confirmation" } });
  expect(input.checkValidity()).toBe(false);
  fireEvent.change(input, { target: { value: "DELETE" } });
  expect(input.checkValidity()).toBe(true);
  expect(screen.getByText(/access stays disabled/)).toBeTruthy();
  expect(vi.mocked(api).mock.calls.some((c) => c[2] === "DELETE")).toBe(false);
});
it("reports a profile failure and prevents duplicate submission while pending", async () => {
  mount("settings");
  const button = await screen.findByRole("button", { name: "Save profile" });
  let reject!: (error: Error) => void;
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((_resolve, failure) => {
        reject = failure;
      }),
  );
  fireEvent.submit(button.closest("form")!);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true),
  );
  reject(
    Error(
      "Authentication is temporarily rate limited. Please try again shortly.",
    ),
  );
  await screen.findByText(/Authentication is temporarily rate limited/);
  expect(
    (screen.getByRole("button", { name: "Save profile" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
