import { describe, it, expect } from "vitest";
import { getIO, setIO } from "../socket";

describe("socket", () => {
  it("throws when getIO is called before setIO", () => {
    // On first import the module-level `io` is null, so getIO should throw.
    // NOTE: because module state persists across tests in the same file,
    // this test MUST run before the setIO test below.
    expect(() => getIO()).toThrow("Socket.io not initialized");
  });

  it("returns the same object after setIO", () => {
    const fake = { fake: true } as unknown as Parameters<typeof setIO>[0];
    setIO(fake);

    const result = getIO();
    expect(result).toBe(fake);
  });
});
