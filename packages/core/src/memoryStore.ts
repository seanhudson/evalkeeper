import type { CaseRecord, EvalStore, OutputRecord, RunRecord } from "./store";

/**
 * An EvalStore in memory: for tests, demos, and trying Evalkeeper before
 * adding tables. Everything is gone when the process ends.
 */
export function memoryStore(): EvalStore & {
  cases: CaseRecord[];
  runs: RunRecord[];
  outputs: OutputRecord[];
} {
  const cases: CaseRecord[] = [];
  const runs: RunRecord[] = [];
  const outputs: OutputRecord[] = [];
  let n = 0;
  const id = (prefix: string) => `${prefix}_${(++n).toString(36)}`;
  const now = () => new Date();

  return {
    cases,
    runs,
    outputs,
    async listCases(suite) {
      return cases
        .filter((c) => c.suite === suite && c.status !== "RETIRED")
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
