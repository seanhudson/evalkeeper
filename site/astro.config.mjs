// Evalkeeper's docs site. The guides are written in the repo's docs/ and
// copied in by scripts/docs-site.mjs; the API reference is TypeDoc's,
// served at /api. Published to GitHub Pages by .github/workflows/docs.yml.
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLinksValidator from "starlight-links-validator";

export default defineConfig({
  site: "https://seanhudson.github.io",
  base: "/evalkeeper",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "Evalkeeper",
      description:
        "Evals for the AI features in your TypeScript app: answer keys people confirm, tests per model, and model choices on evidence.",
      logo: { src: "./src/assets/logo.svg" },
      favicon: "/favicon.svg",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/seanhudson/evalkeeper",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/seanhudson/evalkeeper/edit/main/site/",
      },
      lastUpdated: false,
      customCss: ["./src/styles/theme.css"],
      components: { Head: "./src/components/Head.astro" },
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "What Evalkeeper is", link: "/" },
            { label: "Try the example", slug: "start/try-the-example" },
            { label: "Concepts", slug: "start/concepts" },
            { label: "Before you start", slug: "start/before-you-start" },
            { label: "What you get", slug: "start/what-you-get" },
            {
              label: "Add it to your app",
              slug: "start/adding-to-your-app",
            },
          ],
        },
        {
          label: "Using it",
          items: [
            { label: "Build your answer key", slug: "guides/answer-key" },
            {
              label: "Test models and choose one",
              slug: "guides/choosing-models",
            },
            { label: "Thumbs from your users", slug: "guides/thumbs" },
            { label: "Keep the answer key useful", slug: "guides/upkeep" },
            { label: "Best practices", slug: "guides/best-practices" },
          ],
        },
        {
          label: "Going further",
          items: [
            { label: "Models and prices", slug: "guides/models" },
            { label: "Write suites", slug: "guides/suites" },
            { label: "Make the screens your own", slug: "guides/screens" },
            { label: "Already have evals?", slug: "guides/bring-your-own" },
          ],
        },
        {
          label: "Upgrading",
          items: [
            { label: "How to upgrade", slug: "upgrading/how-to-upgrade" },
            { label: "What changed", slug: "upgrading/changelog" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "API reference", link: "/api/" },
            { label: "Roadmap", slug: "project/roadmap" },
            { label: "Architecture", slug: "project/architecture" },
          ],
        },
      ],
      plugins: [
        starlightLinksValidator({
          // TypeDoc's pages, copied in beside the site.
          exclude: ["/evalkeeper/api/", "/evalkeeper/api/**"],
        }),
      ],
    }),
  ],
});
