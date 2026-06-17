/** Parse CSV text into rows of string cells (handles quoted fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (c === '\n' || (c === '\r' && next === '\n')) {
      row.push(cell.trim());
      if (row.some(v => v.length)) rows.push(row);
      row = [];
      cell = '';
      if (c === '\r') i++;
    } else if (c !== '\r') {
      cell += c;
    }
  }

  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some(v => v.length)) rows.push(row);
  }

  return rows;
}
