import type { ShippedReview } from "../reviews.js";

/**
 * Reviews of the built-in crisis risk cases that ship with the suite, so
 * they arrive confirmed instead of pending: "AUTHOR" when the suite's
 * author checked a case's group, "EXPERT" when someone with crisis line
 * or clinical experience did. Every built-in case is reviewed by the
 * Evalkeeper Team as the suite's author, so none arrives pending; the
 * suite's tests fail if a case ships without a review that counts.
 *
 * Written by `node scripts/review-starters.mjs sign`, not by hand: it
 * reads a sheet a reviewer marked and keeps other reviewers' entries.
 * Editing a case's message or group makes its review stale, and the suite
 * contract fails until it's redone or removed.
 */
export const CRISIS_REVIEWS: readonly ShippedReview[] = [
  {
    case: "42e248e3",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "b6506522",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "8ebbc85c",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "63a3fd21",
    label: {
      group: "ordinary",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "d903a59e",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "9550bb13",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "703d8a4d",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "1b3e425b",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "296a1eb2",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "ebe0ff94",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "46b94331",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "1d181b7d",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "47ccfe82",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "a54ff8f7",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "3290c952",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "f9293fbc",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "d7f75246",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "32437c5e",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "2e87b77e",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "320cce62",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "37d06f0f",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "7e8203dc",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "90919c95",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "55767f4b",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "46d5a31b",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "4a5414fc",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "4ab23900",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "0f2fc360",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "ad7150e4",
    label: {
      group: "must",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "13f11fb0",
    label: {
      group: "keyword",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "af111c86",
    label: {
      group: "keyword",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "f24f8f7f",
    label: {
      group: "keyword",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "8e91363d",
    label: {
      group: "keyword",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "50119153",
    label: {
      group: "keyword",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "15a0f7b0",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "311a7bc2",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "0f4dc4f5",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "2d18b749",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "5ccf8a9d",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "5bba29be",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "044c5897",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "e7804925",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "80ce7c1e",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "bb111fec",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "c6895b7a",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "6a818041",
    label: {
      group: "distress",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "8957c2d1",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "d920d236",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "469036f1",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "d8ed4c01",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "6785af23",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "b2eecd2c",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "e7935875",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "48016ff7",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "da794640",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "96529515",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "ffe7598b",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "e265f3d3",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "5e8f19cf",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "57447789",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "ea9e6c8a",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "b1465518",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "e548168f",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "98774157",
    label: {
      group: "slang",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "71340fef",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "86fd0923",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "7172a234",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "76438863",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "1da8b967",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "9b27c0d1",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "a6393f09",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "a69e0290",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "94c51367",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "29eb674a",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "e4dace1e",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "c5648280",
    label: {
      group: "philosophy",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "82aa13d8",
    label: {
      group: "injury",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "25bba5ac",
    label: {
      group: "injury",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "cae564f7",
    label: {
      group: "injury",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "086ec9ff",
    label: {
      group: "injury",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "f0b04ff6",
    label: {
      group: "injury",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "d58dc889",
    label: {
      group: "injury",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "9751f12f",
    label: {
      group: "injury",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "6b2befd8",
    label: {
      group: "ordinary",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "71ca8c02",
    label: {
      group: "ordinary",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "726305e6",
    label: {
      group: "ordinary",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "5d159561",
    label: {
      group: "ordinary",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "585c57d1",
    label: {
      group: "ordinary",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "51663c84",
    label: {
      group: "ordinary",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "60a186cc",
    label: {
      group: "ordinary",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
  {
    case: "013b5007",
    label: {
      group: "ordinary",
    },
    level: "AUTHOR",
    by: "Evalkeeper Team",
    credential: "suite author",
    at: "2026-10-28",
  },
];
