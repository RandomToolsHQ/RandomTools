// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ToolPage from "../src/ToolPage";
vi.mock("../src/api", () => ({ api: async () => ({ availability: [] }) }));
describe("tool workspace accessibility", () => {
  it("labels inputs and announces invalid JSON", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/tools/json"]}>
          <Routes>
            <Route path="/tools/:id" element={<ToolPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Input"), {
      target: { value: "{bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run tool" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("Input"), {
      target: { value: '{"ok":true}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run tool" }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Result") as HTMLTextAreaElement).value,
      ).toContain('"ok": true'),
    );
    expect(screen.getByRole("button", { name: "Copy result" })).toBeTruthy();
  });
});
