// Loaded with `node --import`: makes "vitest" unresolvable, as in an app
// that doesn't install it. Used by contracts-node.test.mjs.
import { register } from "node:module";

register("./block-vitest-hooks.mjs", import.meta.url);
