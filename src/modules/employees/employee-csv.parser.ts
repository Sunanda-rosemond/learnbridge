import { Buffer } from 'node:buffer';
import { parse, CsvError } from 'csv-parse/sync';

const MAX_FILE_BYTES = 1024 * 1024; // 1 MiB
const MAX_DATA_ROWS = 1000;

const REQUIRED_HEADERS = [
  'externalEmployeeId',
  'workEmail',
  'employmentStatus',
];

const ALLOWED_HEADERS = [...REQUIRED_HEADERS, 'managerExternalId'];

export class EmployeeCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmployeeCsvError';
  }
}

export type ParsedEmployeeCsv = {
  headers: string[];
  rows: {
    row: number;
    cells: string[];
  }[];
};

export function parseEmployeeCsv(csv: string): ParsedEmployeeCsv {
  if (Buffer.byteLength(csv, 'utf8') > MAX_FILE_BYTES) {
    throw new EmployeeCsvError('CSV must not exceed 1 MiB');
  }

  let records: string[][];

  try {
    records = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      max_record_size: MAX_FILE_BYTES,
    });
  } catch (error: unknown) {
    if (error instanceof CsvError) {
      throw new EmployeeCsvError(`Malformed CSV: ${error.code}`);
    }

    throw error;
  }

  const [headerRecord, ...dataRecords] = records;

  if (!headerRecord) {
    throw new EmployeeCsvError('CSV must contain a header row');
  }

  const headers = headerRecord.map((header) => header.trim());

  if (new Set(headers).size !== headers.length) {
    throw new EmployeeCsvError('Duplicate column headers are not allowed');
  }

  const missing = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header),
  );

  if (missing.length > 0) {
    throw new EmployeeCsvError(
      `Missing required headers: ${missing.join(', ')}`,
    );
  }

  const unknown = headers.filter((header) => !ALLOWED_HEADERS.includes(header));

  if (unknown.length > 0) {
    throw new EmployeeCsvError(`Unknown headers: ${unknown.join(', ')}`);
  }

  if (dataRecords.length === 0) {
    throw new EmployeeCsvError('CSV must contain at least one employee');
  }

  if (dataRecords.length > MAX_DATA_ROWS) {
    throw new EmployeeCsvError(
      `CSV must not exceed ${MAX_DATA_ROWS} employee rows`,
    );
  }

  return {
    headers,
    rows: dataRecords.map((cells, index) => ({
      row: index + 2,
      cells,
    })),
  };
}
