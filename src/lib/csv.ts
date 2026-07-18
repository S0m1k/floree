// Minimal CSV builder shared by the server-side export route handler and any
// client-side "export selection" button. No dependencies, works in both
// environments (no next/headers, no DOM APIs).

const BOM = '﻿';

function escapeCsvCell(value: string): string {
  if (/[",\n\r;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  // UTF-8 BOM so Excel (which guesses ANSI otherwise) renders Cyrillic correctly.
  return BOM + lines.join('\r\n') + '\r\n';
}
