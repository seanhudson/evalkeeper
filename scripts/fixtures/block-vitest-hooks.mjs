// Module hooks (see block-vitest.mjs): "vitest" and its subpaths aren't
// found, the way Node reports a package that isn't installed.

/**
 * Resolves every specifier as usual, except Vitest's.
 *
 * @param {string} specifier - What's being imported.
 * @param {object} context - Node's resolve context.
 * @param {Function} next - The next resolver.
 */
export async function resolve(specifier, context, next) {
  if (specifier === "vitest" || specifier.startsWith("vitest/")) {
    const e = new Error(`Cannot find package '${specifier}'`);
    Object.assign(e, { code: "ERR_MODULE_NOT_FOUND" });
    throw e;
  }
  return next(specifier, context);
}
