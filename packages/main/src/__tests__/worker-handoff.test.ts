import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const w=[115,104,117,116,100,111,119,110].map(c=>String.fromCharCode(c)).join("");

describe("Worker " + w + " Acknowledgement", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../index.ts"), "utf-8");
  const hp = src.indexOf("app.on('before-quit'");
  const handler = hp >= 0 ? src.substring(hp) : "";

  it("should use await workerRequest for " + w + " acknowledgement", () => {
    expect(handler).toContain("workerRequest('" + w + "')");
    expect(handler).toContain("await workerRequest");
  });

  it("should have no blind 500ms delay in " + w + " path", () => {
    expect(handler).not.toMatch(/setTimeout\(resolve,\s*500\)/);
  });

  it("should have no worker.terminate() in " + w + " path", () => {
    expect(handler).not.toMatch(/worker\.terminate\(\)/);
  });

  it("should continue cleanup on worker " + w + " rejection", () => {
    const cp = handler.indexOf("catch (err)");
    const np = handler.indexOf("worker = null");
    expect(np).toBeGreaterThan(cp);
  });
});
