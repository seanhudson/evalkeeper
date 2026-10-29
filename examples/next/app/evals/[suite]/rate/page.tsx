import { pages } from "@/lib/evalkeeper/evals";

// Written by `npx @crowandraven/evalkeeper add pages`: don't edit it.
// Blind rating: one case at a time, by its input only.

export const dynamic = "force-dynamic";
export const generateMetadata = pages.rate.generateMetadata;
export default pages.rate.Page;
