export interface CsvRow {
  fields: string[];
  line: number;
}

export function parseCsv(input: string): CsvRow[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: CsvRow[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const endField = (): void => {
    fields.push(field);
    field = '';
  };

  const endRow = (): void => {
    endField();
    if (fields.some((value) => value.trim() !== '')) {
      rows.push({ fields, line: rowStartLine });
    }
    fields = [];
    rowStartLine = line;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else if (ch === '\r') {
        if (text[i + 1] === '\n') i += 1;
        line += 1;
        field += '\n';
      } else if (ch === '\n') {
        line += 1;
        field += '\n';
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      line += 1;
      endRow();
    } else if (ch === '\n') {
      line += 1;
      endRow();
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || fields.length > 0) {
    endRow();
  }

  return rows;
}
