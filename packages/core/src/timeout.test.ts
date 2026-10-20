import { describe, expect, it, vi } from "vitest";
import { withTimeout } from "./timeout.js";

describe("withTimeout", () => {
  it("passes an answer through in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("fails an answer that takes too long", async () => {
    vi.useFakeTimers();
    const slow = new Promise(() => {});
    const p = withTimeout(slow, 60_000);
    vi.advanceTimersByTime(60_000);
    await expect(p).rejects.toThrow("No answer within 60s");
    vi.useRealTimers();
  });
});
