import { describe, expect, it } from "vitest";
import {
  captureFacetMutation,
  findPendingFacetMutation,
  markMutationAttemptFailed,
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
});
