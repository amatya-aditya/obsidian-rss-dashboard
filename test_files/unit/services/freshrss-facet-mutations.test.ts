import { describe, expect, it } from "vitest";
import {
  applyLabelMembership,
  buildLabelMappings,
  cancelPendingMutation,
  captureFacetMutation,
  diffLabelMembershipChanges,
  dispatchableFacetMutations,
  findPendingFacetMutation,
  isLabelFacet,
  isSynchronizableFacet,
  isTerminalMutation,
  labelNameFromFacet,
  makeLabelFacet,
  markMutationAttemptFailed,
  normalizeFreshRssLabelName,
  rearmTerminalMutation,
  removeAcknowledgedMutation,
  type FreshRssPendingFacetMutation,
} from "../../../src/services/freshrss-facet-mutations";

describe("FreshRSS pending facet mutation capture/coalescing", () => {
  describe("captureFacetMutation", () => {
    it("records a new pending mutation with a generated operation ID and absolute desired state", () => {
      const result = captureFacetMutation([], {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-1",
      });

      expect(result).toEqual([
        {
          operationId: "op-1",
          remoteArticleId: "article-1",
          facet: "read",
          desiredState: true,
          createdAtMs: 1000,
          lastAttemptAtMs: null,
          attemptCount: 0,
          error: null,
        },
      ]);
    });

    it("replaces the prior pending record for the same article and facet with a new operation ID, rather than appending history", () => {
      const first = captureFacetMutation([], {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-1",
      });

      const second = captureFacetMutation(first, {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: false,
        nowMs: 2000,
        createOperationId: () => "op-2",
      });

      expect(second).toHaveLength(1);
      expect(second[0]).toMatchObject({
        operationId: "op-2",
        desiredState: false,
        createdAtMs: 2000,
      });
    });

    it("resets attempt count and error state when a new decision replaces a previously-errored record", () => {
      const errored: FreshRssPendingFacetMutation[] = [
        {
          operationId: "op-1",
          remoteArticleId: "article-1",
          facet: "read",
          desiredState: true,
          createdAtMs: 1000,
          lastAttemptAtMs: 1500,
          attemptCount: 3,
          error: { category: "terminal", message: "rejected" },
        },
      ];

      const result = captureFacetMutation(errored, {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: false,
        nowMs: 2000,
        createOperationId: () => "op-2",
      });

      expect(result).toEqual([
        {
          operationId: "op-2",
          remoteArticleId: "article-1",
          facet: "read",
          desiredState: false,
          createdAtMs: 2000,
          lastAttemptAtMs: null,
          attemptCount: 0,
          error: null,
        },
      ]);
    });

    it("keeps independent records for different facets of the same article", () => {
      const withRead = captureFacetMutation([], {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-read",
      });
      const withBoth = captureFacetMutation(withRead, {
        remoteArticleId: "article-1",
        facet: "starred",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-starred",
      });

      expect(withBoth).toHaveLength(2);
      expect(
        findPendingFacetMutation(withBoth, { remoteArticleId: "article-1", facet: "read" }),
      ).toMatchObject({ operationId: "op-read" });
      expect(
        findPendingFacetMutation(withBoth, { remoteArticleId: "article-1", facet: "starred" }),
      ).toMatchObject({ operationId: "op-starred" });

      // Replacing the starred decision must not disturb the read record.
      const afterStarredChange = captureFacetMutation(withBoth, {
        remoteArticleId: "article-1",
        facet: "starred",
        desiredState: false,
        nowMs: 2000,
        createOperationId: () => "op-starred-2",
      });
      expect(afterStarredChange).toHaveLength(2);
      expect(
        findPendingFacetMutation(afterStarredChange, { remoteArticleId: "article-1", facet: "read" }),
      ).toMatchObject({ operationId: "op-read", desiredState: true });
      expect(
        findPendingFacetMutation(afterStarredChange, { remoteArticleId: "article-1", facet: "starred" }),
      ).toMatchObject({ operationId: "op-starred-2", desiredState: false });
    });

    it("keeps independent records for different articles", () => {
      const result = captureFacetMutation(
        captureFacetMutation([], {
          remoteArticleId: "article-1",
          facet: "read",
          desiredState: true,
          nowMs: 1000,
          createOperationId: () => "op-1",
        }),
        {
          remoteArticleId: "article-2",
          facet: "read",
          desiredState: true,
          nowMs: 1000,
          createOperationId: () => "op-2",
        },
      );

      expect(result).toHaveLength(2);
      expect(result.map((m) => m.remoteArticleId).sort()).toEqual(["article-1", "article-2"]);
    });
  });

  describe("removeAcknowledgedMutation", () => {
    it("removes the record when the acknowledgment's operation ID matches the current record", () => {
      const pending = captureFacetMutation([], {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-1",
      });

      const result = removeAcknowledgedMutation(pending, {
        remoteArticleId: "article-1",
        facet: "read",
        operationId: "op-1",
      });

      expect(result).toEqual([]);
    });

    it("does not remove a newer record when a stale/delayed acknowledgment names a superseded operation ID", () => {
      const afterFirstChoice = captureFacetMutation([], {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-1",
      });
      // The user changes their mind again before op-1's response arrives.
      const afterSecondChoice = captureFacetMutation(afterFirstChoice, {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: false,
        nowMs: 2000,
        createOperationId: () => "op-2",
      });

      // op-1's delayed acknowledgment finally arrives.
      const result = removeAcknowledgedMutation(afterSecondChoice, {
        remoteArticleId: "article-1",
        facet: "read",
        operationId: "op-1",
      });

      expect(result).toEqual(afterSecondChoice);
      expect(findPendingFacetMutation(result, { remoteArticleId: "article-1", facet: "read" })).toMatchObject({
        operationId: "op-2",
        desiredState: false,
      });
    });

    it("leaves unrelated records for other articles untouched", () => {
      const pending = captureFacetMutation(
        captureFacetMutation([], {
          remoteArticleId: "article-1",
          facet: "read",
          desiredState: true,
          nowMs: 1000,
          createOperationId: () => "op-1",
        }),
        {
          remoteArticleId: "article-2",
          facet: "read",
          desiredState: true,
          nowMs: 1000,
          createOperationId: () => "op-2",
        },
      );

      const result = removeAcknowledgedMutation(pending, {
        remoteArticleId: "article-1",
        facet: "read",
        operationId: "op-1",
      });

      expect(result).toHaveLength(1);
      expect(result[0].remoteArticleId).toBe("article-2");
    });
  });

  describe("markMutationAttemptFailed", () => {
    it("increments the attempt count and records error state on the matching operation", () => {
      const pending = captureFacetMutation([], {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-1",
      });

      const result = markMutationAttemptFailed(
        pending,
        { remoteArticleId: "article-1", facet: "read", operationId: "op-1" },
        3000,
        { category: "terminal", message: "FreshRSS rejected this change." },
      );

      expect(result).toEqual([
        {
          operationId: "op-1",
          remoteArticleId: "article-1",
          facet: "read",
          desiredState: true,
          createdAtMs: 1000,
          lastAttemptAtMs: 3000,
          attemptCount: 1,
          error: { category: "terminal", message: "FreshRSS rejected this change." },
        },
      ]);
    });

    it("does not modify a record whose operation ID has since been superseded", () => {
      const afterFirstChoice = captureFacetMutation([], {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-1",
      });
      const afterSecondChoice = captureFacetMutation(afterFirstChoice, {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: false,
        nowMs: 2000,
        createOperationId: () => "op-2",
      });

      const result = markMutationAttemptFailed(
        afterSecondChoice,
        { remoteArticleId: "article-1", facet: "read", operationId: "op-1" },
        3000,
        { category: "unavailable", message: "network error" },
      );

      expect(result).toEqual(afterSecondChoice);
    });
  });

  describe("findPendingFacetMutation", () => {
    it("returns null when there is no current pending record", () => {
      expect(
        findPendingFacetMutation([], { remoteArticleId: "article-1", facet: "read" }),
      ).toBeNull();
    });
  });

  describe("mapped-label facet capture/coalescing (ticket 06)", () => {
    it("captures, replaces, and acknowledges a dynamic label facet exactly like read/starred", () => {
      const captured = captureFacetMutation([], {
        remoteArticleId: "article-1",
        facet: "label:tech",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-1",
      });
      expect(captured).toEqual([
        {
          operationId: "op-1",
          remoteArticleId: "article-1",
          facet: "label:tech",
          desiredState: true,
          createdAtMs: 1000,
          lastAttemptAtMs: null,
          attemptCount: 0,
          error: null,
        },
      ]);

      // A label facet's record is independent of a read/starred record for
      // the same article.
      const withRead = captureFacetMutation(captured, {
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-read",
      });
      expect(withRead).toHaveLength(2);

      const acknowledged = removeAcknowledgedMutation(withRead, {
        remoteArticleId: "article-1",
        facet: "label:tech",
        operationId: "op-1",
      });
      expect(acknowledged).toEqual([
        expect.objectContaining({ facet: "read", operationId: "op-read" }),
      ]);
    });

    it("keeps independent records for two different mapped labels on the same article", () => {
      const withTech = captureFacetMutation([], {
        remoteArticleId: "article-1",
        facet: "label:tech",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-tech",
      });
      const withBoth = captureFacetMutation(withTech, {
        remoteArticleId: "article-1",
        facet: "label:news",
        desiredState: true,
        nowMs: 1000,
        createOperationId: () => "op-news",
      });

      expect(withBoth).toHaveLength(2);
      const removedTech = removeAcknowledgedMutation(withBoth, {
        remoteArticleId: "article-1",
        facet: "label:tech",
        operationId: "op-tech",
      });
      expect(removedTech).toEqual([
        expect.objectContaining({ facet: "label:news", operationId: "op-news" }),
      ]);
    });
  });

  describe("isLabelFacet / isSynchronizableFacet", () => {
    it("accepts read, starred, and a well-formed label facet", () => {
      expect(isSynchronizableFacet("read")).toBe(true);
      expect(isSynchronizableFacet("starred")).toBe(true);
      expect(isSynchronizableFacet("label:tech")).toBe(true);
      expect(isLabelFacet("label:tech")).toBe(true);
    });

    it("rejects an empty label name, a bare prefix, and an unrelated string", () => {
      expect(isSynchronizableFacet("label:")).toBe(false);
      expect(isLabelFacet("label:")).toBe(false);
      expect(isSynchronizableFacet("bogus")).toBe(false);
      expect(isSynchronizableFacet(123)).toBe(false);
      expect(isSynchronizableFacet(null)).toBe(false);
    });
  });

  describe("makeLabelFacet / labelNameFromFacet", () => {
    it("round-trips a normalized label name through the facet identifier", () => {
      const facet = makeLabelFacet("tech");
      expect(facet).toBe("label:tech");
      expect(labelNameFromFacet(facet)).toBe("tech");
    });
  });

  describe("normalizeFreshRssLabelName", () => {
    it("trims surrounding whitespace and lower-cases, independent of locale-sensitive casing", () => {
      expect(normalizeFreshRssLabelName("  Tech  ")).toBe("tech");
      expect(normalizeFreshRssLabelName("TECH")).toBe("tech");
      expect(normalizeFreshRssLabelName("tech")).toBe("tech");
    });

    it("produces the same key for names that only differ by case and surrounding whitespace", () => {
      const names = ["Tech", " tech ", "TECH", "TeCh"];
      const normalized = new Set(names.map(normalizeFreshRssLabelName));
      expect(normalized).toEqual(new Set(["tech"]));
    });
  });

  describe("buildLabelMappings", () => {
    it("maps a label entry, keyed by its normalized name", () => {
      const result = buildLabelMappings([
        { remoteTagId: "user/-/label/Tech", displayName: "Tech", kind: "label" },
      ]);
      expect(result).toEqual({
        mappings: [
          {
            normalizedName: "tech",
            remoteTagId: "user/-/label/Tech",
            kind: "label",
            displayName: "Tech",
          },
        ],
        ambiguousNormalizedNames: [],
      });
    });

    it("excludes system streams and folder-kind entries from becoming label mappings", () => {
      const result = buildLabelMappings([
        { remoteTagId: "user/-/state/com.google/read", displayName: "read", kind: "system" },
        { remoteTagId: "user/-/state/com.google/starred", displayName: "starred", kind: "system" },
        { remoteTagId: "user/-/label/Archive", displayName: "Archive", kind: "folder" },
        { remoteTagId: "user/-/label/Tech", displayName: "Tech", kind: "label" },
      ]);
      expect(result.mappings).toEqual([
        {
          normalizedName: "tech",
          remoteTagId: "user/-/label/Tech",
          kind: "label",
          displayName: "Tech",
        },
      ]);
    });

    it("treats case/whitespace variants of the same remote tag as one mapping, keyed consistently", () => {
      const result = buildLabelMappings([
        { remoteTagId: "user/-/label/Tech", displayName: " Tech ", kind: "label" },
      ]);
      expect(result.mappings[0].normalizedName).toBe("tech");
    });

    it("excludes both sides of a mapping-name collision between two distinct remote tags", () => {
      const result = buildLabelMappings([
        { remoteTagId: "user/-/label/Tech", displayName: "Tech", kind: "label" },
        { remoteTagId: "user/-/label/tech-2", displayName: "tech", kind: "label" },
        { remoteTagId: "user/-/label/News", displayName: "News", kind: "label" },
      ]);
      expect(result.mappings).toEqual([
        {
          normalizedName: "news",
          remoteTagId: "user/-/label/News",
          kind: "label",
          displayName: "News",
        },
      ]);
      expect(result.ambiguousNormalizedNames).toEqual(["tech"]);
    });

    it("does not treat the same remote tag id reported twice as a collision", () => {
      const result = buildLabelMappings([
        { remoteTagId: "user/-/label/Tech", displayName: "Tech", kind: "label" },
        { remoteTagId: "user/-/label/Tech", displayName: "Tech", kind: "label" },
      ]);
      expect(result.mappings).toHaveLength(1);
      expect(result.ambiguousNormalizedNames).toEqual([]);
    });
  });

  describe("applyLabelMembership", () => {
    it("adds a new tag using an already-known local tag's spelling and color when one exists", () => {
      const result = applyLabelMembership(undefined, "tech", true, {
        availableTags: [{ name: "Tech", color: "#123456" }],
        remoteDisplayName: "Tech",
      });
      expect(result).toEqual([{ name: "Tech", color: "#123456" }]);
    });

    it("falls back to the remote display name and a default color when no local tag is known yet", () => {
      const result = applyLabelMembership(undefined, "tech", true, {
        availableTags: [],
        remoteDisplayName: "Tech",
      });
      expect(result).toEqual([{ name: "Tech", color: "#95a5a6" }]);
    });

    it("leaves an already-present tag's spelling and color untouched when membership is added again", () => {
      const existing = [{ name: "tech-stuff", color: "#abcdef" }];
      const result = applyLabelMembership(existing, "tech-stuff", true, {
        availableTags: [{ name: "Tech-Stuff", color: "#000000" }],
        remoteDisplayName: "Tech-Stuff",
      });
      expect(result).toEqual(existing);
    });

    it("removes only the matching label by normalized name, leaving other tags untouched", () => {
      const existing = [
        { name: "Tech", color: "#111111" },
        { name: "Favorite", color: "#f1c40f" },
      ];
      const result = applyLabelMembership(existing, "tech", false, {
        availableTags: [],
        remoteDisplayName: "Tech",
      });
      expect(result).toEqual([{ name: "Favorite", color: "#f1c40f" }]);
    });

    it("is a no-op when removing a label that isn't present", () => {
      const existing = [{ name: "Favorite", color: "#f1c40f" }];
      const result = applyLabelMembership(existing, "tech", false, {
        availableTags: [],
        remoteDisplayName: "Tech",
      });
      expect(result).toEqual(existing);
    });

    it("never mutates the input tags array", () => {
      const existing = [{ name: "Favorite", color: "#f1c40f" }];
      applyLabelMembership(existing, "tech", true, {
        availableTags: [],
        remoteDisplayName: "Tech",
      });
      expect(existing).toEqual([{ name: "Favorite", color: "#f1c40f" }]);
    });

    it("matches an existing tag case-insensitively so remote membership doesn't create a duplicate", () => {
      const existing = [{ name: "TECH", color: "#111111" }];
      const result = applyLabelMembership(existing, "tech", true, {
        availableTags: [],
        remoteDisplayName: "Tech",
      });
      expect(result).toEqual(existing);
    });
  });

  describe("diffLabelMembershipChanges", () => {
    const known = new Set(["tech", "news"]);

    it("reports an addition for a newly-present KNOWN label", () => {
      const result = diffLabelMembershipChanges(known, [], [{ name: "Tech" }]);
      expect(result).toEqual([{ normalizedName: "tech", desiredState: true }]);
    });

    it("reports a removal for a KNOWN label no longer present", () => {
      const result = diffLabelMembershipChanges(known, [{ name: "Tech" }], []);
      expect(result).toEqual([{ normalizedName: "tech", desiredState: false }]);
    });

    it("ignores an UNKNOWN (unmapped) tag added or removed", () => {
      const added = diffLabelMembershipChanges(known, [], [{ name: "Local Only" }]);
      const removed = diffLabelMembershipChanges(known, [{ name: "Local Only" }], []);
      expect(added).toEqual([]);
      expect(removed).toEqual([]);
    });

    it("normalizes case and surrounding whitespace before comparing against known names", () => {
      const result = diffLabelMembershipChanges(known, [], [{ name: " TECH " }]);
      expect(result).toEqual([{ normalizedName: "tech", desiredState: true }]);
    });

    it("reports independent changes when multiple known labels change at once", () => {
      const result = diffLabelMembershipChanges(
        known,
        [{ name: "Tech" }],
        [{ name: "News" }],
      );
      expect(result).toEqual(
        expect.arrayContaining([
          { normalizedName: "tech", desiredState: false },
          { normalizedName: "news", desiredState: true },
        ]),
      );
      expect(result).toHaveLength(2);
    });

    it("returns no changes when nothing known changed", () => {
      const result = diffLabelMembershipChanges(
        known,
        [{ name: "Tech" }, { name: "Local Only" }],
        [{ name: "Tech" }, { name: "Local Only" }],
      );
      expect(result).toEqual([]);
    });

    it("treats undefined previous/next tags the same as an empty array", () => {
      const result = diffLabelMembershipChanges(known, undefined, undefined);
      expect(result).toEqual([]);
    });

    it("returns no changes when the known-name set is empty", () => {
      const result = diffLabelMembershipChanges(new Set(), [], [{ name: "Tech" }]);
      expect(result).toEqual([]);
    });
  });

  describe("terminal mutation repair", () => {
    function terminalMutation(
      overrides: Partial<FreshRssPendingFacetMutation> = {},
    ): FreshRssPendingFacetMutation {
      return {
        operationId: "op-1",
        remoteArticleId: "article-1",
        facet: "read",
        desiredState: true,
        createdAtMs: 1000,
        lastAttemptAtMs: 1500,
        attemptCount: 1,
        error: { category: "terminal", message: "FreshRSS rejected this read/unread change." },
        ...overrides,
      };
    }

    describe("isTerminalMutation", () => {
      it("is true only for a record whose most recent error is terminal", () => {
        expect(isTerminalMutation(terminalMutation())).toBe(true);
        expect(isTerminalMutation(terminalMutation({ error: null }))).toBe(false);
        expect(
          isTerminalMutation(
            terminalMutation({
              error: { category: "unavailable", message: "network error" },
            }),
          ),
        ).toBe(false);
      });
    });

    describe("dispatchableFacetMutations", () => {
      it("excludes a terminal record but keeps every other synchronizable record", () => {
        const terminal = terminalMutation();
        const pending = captureFacetMutation([terminal], {
          remoteArticleId: "article-2",
          facet: "starred",
          desiredState: true,
          nowMs: 2000,
          createOperationId: () => "op-2",
        });

        const dispatchable = dispatchableFacetMutations(pending);

        expect(dispatchable).toHaveLength(1);
        expect(dispatchable[0].remoteArticleId).toBe("article-2");
      });

      it("returns every record when none are terminal", () => {
        const pending = captureFacetMutation([], {
          remoteArticleId: "article-1",
          facet: "read",
          desiredState: true,
          nowMs: 1000,
          createOperationId: () => "op-1",
        });
        expect(dispatchableFacetMutations(pending)).toEqual(pending);
      });
    });

    describe("rearmTerminalMutation", () => {
      it("clears a terminal record's error without discarding its desired state, creation time, or attempt history", () => {
        const terminal = terminalMutation();
        const result = rearmTerminalMutation([terminal], {
          remoteArticleId: "article-1",
          facet: "read",
        });

        expect(result).toEqual([{ ...terminal, error: null }]);
        // A rearmed record is dispatchable again.
        expect(dispatchableFacetMutations(result)).toEqual(result);
      });

      it("is a no-op that returns the input unchanged when no record matches", () => {
        const existing = [terminalMutation()];
        const result = rearmTerminalMutation(existing, {
          remoteArticleId: "no-such-article",
          facet: "read",
        });
        expect(result).toBe(existing);
      });

      it("is a no-op when the matching record is not currently terminal", () => {
        const nonTerminal = terminalMutation({ error: null });
        const existing = [nonTerminal];
        const result = rearmTerminalMutation(existing, {
          remoteArticleId: "article-1",
          facet: "read",
        });
        expect(result).toBe(existing);
      });

      it("leaves unrelated records untouched", () => {
        const terminal = terminalMutation();
        const other = terminalMutation({
          remoteArticleId: "article-2",
          error: { category: "terminal", message: "other" },
        });
        const result = rearmTerminalMutation([terminal, other], {
          remoteArticleId: "article-1",
          facet: "read",
        });
        expect(result).toEqual([{ ...terminal, error: null }, other]);
      });
    });

    describe("cancelPendingMutation", () => {
      it("removes the pending record regardless of its current error state", () => {
        const terminal = terminalMutation();
        const result = cancelPendingMutation([terminal], {
          remoteArticleId: "article-1",
          facet: "read",
        });
        expect(result).toEqual([]);
      });

      it("removes a non-terminal pending record too -- an explicit cancel is unconditional", () => {
        const nonTerminal = terminalMutation({ error: null });
        const result = cancelPendingMutation([nonTerminal], {
          remoteArticleId: "article-1",
          facet: "read",
        });
        expect(result).toEqual([]);
      });

      it("leaves unrelated records untouched", () => {
        const terminal = terminalMutation();
        const other = terminalMutation({ remoteArticleId: "article-2" });
        const result = cancelPendingMutation([terminal, other], {
          remoteArticleId: "article-1",
          facet: "read",
        });
        expect(result).toEqual([other]);
      });
    });
  });
});
