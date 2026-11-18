import { describe, expect, it } from "vitest";
import { href, parseHash } from "./router";

describe("router", () => {
  it("parses campaign routes and falls back to overview", () => {
    expect(parseHash("#/")).toEqual({ campaignId: null, page: "overview" });
    expect(parseHash("#/c/abc/compare")).toEqual({ campaignId: "abc", page: "compare" });
    expect(parseHash("#/c/abc/nonsense")).toEqual({ campaignId: "abc", page: "overview" });
  });
  it("round-trips ids with special characters", () => {
    expect(parseHash(href("a b/c", "replay"))).toEqual({ campaignId: "a b/c", page: "replay" });
  });
});
