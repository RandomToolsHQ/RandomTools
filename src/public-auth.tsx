import type { ReactNode } from "react";
// Public builds must not include or initialize the development identity SDK.
export function Authentication({ children }: { children: ReactNode }) {
  return children;
}
