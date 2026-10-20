export function createCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly (keyof T)[],
): string {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = columns.map((column) => escape(String(column))).join(',');
  return [header, ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\r\n');
}
