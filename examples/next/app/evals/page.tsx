import { pages } from "@/lib/evalkeeper/evals";

// Written by `npx @crowandraven/evalkeeper add pages`. To arrange
// the hub your own way, replace this file with the sections ("Arrange
// your own page" in the guide).

export const dynamic = "force-dynamic";
export const generateMetadata = pages.hub.generateMetadata;
export default pages.hub.Page;
