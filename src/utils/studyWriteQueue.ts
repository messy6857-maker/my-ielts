const flushers = new Set<() => void>()
export function registerStudyWriter(flush: () => void) {
  flushers.add(flush)
  return () => flushers.delete(flush)
}
export function flushStudyWrites() { flushers.forEach(flush => flush()) }
