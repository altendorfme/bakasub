/** `fn` sobre `xs` com no máximo `n` em paralelo; a saída mantém a ordem da entrada. */
export async function mapPool<T, R>(
  xs: readonly T[],
  n: number,
  fn: (x: T, i: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(xs.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < xs.length) {
      const i = next++
      out[i] = await fn(xs[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, worker))
  return out
}
