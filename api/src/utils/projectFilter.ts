/** Accept project UUID or job number (with or without J prefix). */
export function normalizeJobNumber(value: string): string {
  return value.replace(/^J/i, '').trim();
}

export function projectFilterParams(projectKey: string): [string, string, string, string] {
  const job = normalizeJobNumber(projectKey);
  return [projectKey, projectKey, job, `J${job}`];
}
