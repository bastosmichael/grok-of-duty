import { expect, test } from "bun:test";

import { cn } from "../src/lib/utils";

test("cn combines conditional classes and resolves Tailwind conflicts", () => {
  expect(cn("px-2", undefined, ["px-4", "text-sm"])).toBe("px-4 text-sm");
});
