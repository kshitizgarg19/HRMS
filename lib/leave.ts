/** Leave-type "scope" = which departments a type applies to.
 *  Stored as a JSON array of department names; null / empty = applies to ALL departments. */

export function parseScope(scope: string | null | undefined): string[] | null {
  if (!scope) return null;
  try {
    const a = JSON.parse(scope);
    return Array.isArray(a) && a.length ? a.map(String) : null;
  } catch {
    return null;
  }
}

export function appliesToDept(scope: string | null | undefined, dept: string | null): boolean {
  const list = parseScope(scope);
  if (!list) return true; // applies to everyone
  return dept ? list.includes(dept) : false;
}

export function scopeToJson(scope: unknown): string | null {
  return Array.isArray(scope) && scope.length ? JSON.stringify(scope.map(String)) : null;
}
