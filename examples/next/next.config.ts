import type { NextConfig } from "next";

const config: NextConfig = {
  // The workspace packages ship TypeScript sources too; build from dist.
  serverExternalPackages: ["@prisma/client"],
};

export default config;
