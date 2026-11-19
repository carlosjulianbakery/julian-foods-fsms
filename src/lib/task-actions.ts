/** One rule for every place a task can be skipped: admins only, never DONE or already SKIPPED. */
export function canSkipTask(role: string, status: string): boolean {
  return role === "ADMIN" && status !== "DONE" && status !== "SKIPPED";
}
