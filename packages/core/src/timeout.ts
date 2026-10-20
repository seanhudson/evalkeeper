/** Rejects if the call takes longer than `ms`. Pure. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`No answer within ${ms / 1000}s`));
      }, ms);
    }),
  ]).finally(() => {
    clearTimeout(timer);
  });
}
