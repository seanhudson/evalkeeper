/**
 * An in-memory store, for tests, demos, and trying Evalkeeper before adding
 * tables.
 *
 * @module evalkeeper/memory
 */
import type { FeedbackRecord, FeedbackStore } from "./feedback.js";
import { cleanRating } from "./feedback.js";
import {
  SettingsConflict,
  type SettingsChange,
  type SettingsStore,
  type SettingsVersion,
} from "./settings.js";
import type {
  CaseRecord,
  EvalStore,
  OutputRecord,
  RunRecord,
} from "./store.js";

/**
 * An EvalStore in memory: for tests, demos, and trying Evalkeeper before
 * adding tables. Everything is gone when the process ends.
 */
export function memoryStore(): EvalStore &
  FeedbackStore &
  SettingsStore & {
    cases: CaseRecord[];
    runs: RunRecord[];
    outputs: OutputRecord[];
    feedback: FeedbackRecord[];
    versions: SettingsVersion[];
    changes: SettingsChange[];
  } {
  const cases: CaseRecord[] = [];
  const runs: RunRecord[] = [];
  const outputs: OutputRecord[] = [];
  const feedback: FeedbackRecord[] = [];
  const versions: SettingsVersion[] = [];
  const changes: SettingsChange[] = [];
  const live = new Map<string, string>();
  let n = 0;
  const id = (prefix: string) => `${prefix}_${(++n).toString(36)}`;
  const now = () => new Date();

  return {
    cases,
    runs,
    outputs,
    feedback,
    versions,
    changes,
    async liveVersion(operation) {
      const id = live.get(operation);
      return versions.find((v) => v.id === id) ?? null;
    },
    async listVersions(operation) {
      return versions
        .filter((v) => v.operation === operation)
        .sort((a, b) => b.number - a.number);
    },
    async listChanges(operation, opts = {}) {
      // Kept in the order they happened, so newest first is the reverse.
      return changes
        .filter((c) => c.operation === operation)
        .reverse()
        .slice(0, opts.limit ?? Infinity);
    },
    async switchTo(operation, sw) {
      // Synchronous from here on, so it's atomic in memory.
      const fromId = live.get(operation) ?? null;
      if (fromId !== sw.expectLive) throw new SettingsConflict(operation);
      let to: SettingsVersion | undefined;
      if (sw.create) {
        const last = versions
          .filter((v) => v.operation === operation)
          .reduce((n, v) => Math.max(n, v.number), 0);
        to = {
          ...sw.create.settings,
          id: id("ver"),
          operation,
          number: last + 1,
          promptVersion: sw.create.promptVersion,
          createdAt: now(),
        };
        versions.push(to);
      } else {
        to = versions.find(
          (v) => v.id === sw.versionId && v.operation === operation,
        );
        if (!to) throw new Error("No such version for this feature");
      }
      live.set(operation, to.id);
      changes.push({
        id: id("chg"),
        operation,
        kind: sw.kind,
        fromVersionId: fromId,
        toVersionId: to.id,
        reason: sw.reason,
        by: sw.by,
        evidence: sw.evidence ?? null,
        createdAt: now(),
      });
      return to;
    },
    async rate(r) {
      const c = cleanRating(r);
      const at = now();
      const prior = feedback.find(
        (f) =>
          f.raterId === c.raterId &&
          f.operation === c.operation &&
          f.targetId === c.targetId,
      );
      if (prior) {
        // A changed rating needs a fresh look.
        if (prior.rating !== c.rating) {
          prior.status = "OPEN";
          prior.caseId = null;
        }
        Object.assign(prior, c, { updatedAt: at });
        return prior;
      }
      const f: FeedbackRecord = {
        ...c,
        id: id("fb"),
        status: "OPEN",
        caseId: null,
        createdAt: at,
        updatedAt: at,
      };
      feedback.push(f);
      return f;
    },
    async clearRating(raterId, operation, targetId) {
      const i = feedback.findIndex(
        (f) =>
          f.raterId === raterId &&
          f.operation === operation &&
          f.targetId === targetId,
      );
      if (i >= 0) feedback.splice(i, 1);
    },
    async listFeedback(opts = {}) {
      return feedback
        .filter(
          (f) =>
            (!opts.operation || f.operation === opts.operation) &&
            (!opts.rating || f.rating === opts.rating) &&
            (!opts.status || f.status === opts.status) &&
            (!opts.since || f.updatedAt >= opts.since),
        )
        .sort((a, b) => +b.updatedAt - +a.updatedAt)
        .slice(0, opts.limit ?? Infinity);
    },
    async setFeedbackStatus(feedbackId, status, caseId = null) {
      const f = feedback.find((x) => x.id === feedbackId);
      if (f) {
        f.status = status;
        f.caseId = caseId;
        f.updatedAt = now();
      }
    },
    async listCases(suite, opts) {
      return cases
        .filter(
          (c) =>
            c.suite === suite &&
            (opts?.includeRetired || c.status !== "RETIRED"),
        )
        .sort((a, b) => +a.createdAt - +b.createdAt);
    },
    async createCase({ labels = [], ...data }) {
      const at = now();
      const c: CaseRecord = {
        ...data,
        id: id("case"),
        createdAt: at,
        updatedAt: at,
        labels: labels.map((l) => ({
          ...l,
          id: id("label"),
          createdAt: at,
          updatedAt: at,
        })),
      };
      cases.push(c);
      return c;
    },
    async addLabel(caseId, data) {
      const c = cases.find((x) => x.id === caseId);
      if (!c) throw new Error(`Unknown case ${caseId}`);
      const at = now();
      const l = { ...data, id: id("label"), createdAt: at, updatedAt: at };
      c.labels.push(l);
      c.updatedAt = at;
      return l;
    },
    async setLabelStatus(labelId, status) {
      for (const c of cases)
        for (const l of c.labels)
          if (l.id === labelId) {
            l.status = status;
            l.updatedAt = now();
          }
    },
    async setCaseStatus(caseId, status) {
      const c = cases.find((x) => x.id === caseId);
      if (c) {
        c.status = status;
        c.updatedAt = now();
      }
    },
    async getRun(runId) {
      return runs.find((r) => r.id === runId) ?? null;
    },
    async listRuns(suite, opts = {}) {
      return runs
        .filter(
          (r) =>
            r.suite === suite && (!opts.status || r.status === opts.status),
        )
        .sort((a, b) => +b.startedAt - +a.startedAt)
        .slice(0, opts.limit ?? Infinity);
    },
    async createRun(data) {
      const r: RunRecord = {
        ...data,
        id: id("run"),
        status: "RUNNING",
        metrics: null,
        error: null,
        startedAt: now(),
        finishedAt: null,
      };
      runs.push(r);
      return r;
    },
    async updateRun(runId, patch, onlyIf) {
      const r = runs.find((x) => x.id === runId);
      if (!r || (onlyIf && r.status !== onlyIf.status)) return;
      Object.assign(r, patch);
    },
    async listOutputs(runId) {
      return outputs.filter((o) => o.runId === runId);
    },
    async findReusableOutput(requestHash, since) {
      return (
        outputs
          .filter(
            (o) =>
              o.requestHash === requestHash &&
              !o.reused &&
              !o.error &&
              o.createdAt >= since,
          )
          .sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null
      );
    },
    async createOutput(data) {
      const o: OutputRecord = { ...data, id: id("out"), createdAt: now() };
      outputs.push(o);
      return o;
    },
    async setOutputScores(outputId, scores) {
      const o = outputs.find((x) => x.id === outputId);
      if (o) o.scores = scores;
    },
  };
}
