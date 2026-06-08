import { downloadCsv } from '@shared/utils/csv-export';

/** Convert an array of objects to CSV and trigger a browser download. */
export function exportToCsv(
  data: Record<string, unknown>[],
  filename: string,
): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => row[h]));
  downloadCsv(filename.endsWith('.csv') ? filename : `${filename}.csv`, headers, rows);
}
