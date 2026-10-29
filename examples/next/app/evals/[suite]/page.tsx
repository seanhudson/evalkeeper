import { pages } from "@/lib/evalkeeper/evals";

// Written by `npx @crowandraven/evalkeeper add pages`. To arrange
// a suite's page your own way, replace this file with the sections ("Arrange
// your own page" in the guide).

export const dynamic = "force-dynamic";
export const generateMetadata = pages.suite.generateMetadata;
export default pages.suite.Page;
