// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ToolPage from "../src/ToolPage";
const mock = vi.hoisted(() => ({ processFile: vi.fn() }));
vi.mock("../src/files", () => ({ processFile: mock.processFile }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { availability: [] } }),
}));
afterEach(cleanup);
it("ignores completed file work after reset and allows the same file again", async () => {
  let finish!: (value: { hash: string }) => void;
  mock.processFile.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <MemoryRouter initialEntries={["/tools/hash"]}>
      <Routes>
        <Route path="/tools/:id" element={<ToolPage />} />
      </Routes>
    </MemoryRouter>,
  );
  const input =
    view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(["hello"], "hello.txt");
  fireEvent.change(input, { target: { files: [file] } });
  expect(input.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /^Reset$/ }));
  await act(async () => {
    finish({ hash: "stale hash" });
  });
  expect((screen.getByLabelText("Result") as HTMLTextAreaElement).value).toBe(
    "",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Download result",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  mock.processFile.mockResolvedValueOnce({ hash: "fresh hash" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  expect((screen.getByLabelText("Result") as HTMLTextAreaElement).value).toBe(
    "fresh hash",
  );
});
