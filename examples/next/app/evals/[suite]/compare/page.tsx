import { pages } from "@/lib/evalkeeper/evals";

// Written by `npx @crowandraven/evalkeeper add pages`: don't edit it.
// Two tests compared: the verdict, each check, and where they differ.

export const dynamic = "force-dynamic";
export const generateMetadata = pages.compare.generateMetadata;
export default pages.compare.Page;
