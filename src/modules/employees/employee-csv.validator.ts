import type { ParsedEmployeeCsv } from './employee-csv.parser.js';
import type { ImportRowResult } from './employee-import.types.js';

import { provisionEmployeeSchema } from './provision-employee.schema.js';

import type { ProvisionEmployeeBody } from './provision-employee.schema.js';

export type ValidatedEmployeeRow = {
  row: number;
  data: ProvisionEmployeeBody;
};

type RejectedRow = Extract<ImportRowResult, { status: 'REJECTED' }>;

export type EmployeeCsvValidationResult = {
  validRows: ValidatedEmployeeRow[];
  rejectedRows: RejectedRow[];
};

export function validateEmployeeCsv(
  csv: ParsedEmployeeCsv,
): EmployeeCsvValidationResult {
  const validRows: ValidatedEmployeeRow[] = [];
  const rejectedRows: RejectedRow[] = [];

  const employeeIdIndex = csv.headers.indexOf('externalEmployeeId');

  for (const { row, cells } of csv.rows) {
    const externalEmployeeId = cells[employeeIdIndex]?.trim() || undefined;

    if (cells.length !== csv.headers.length) {
      rejectedRows.push({
        row,
        externalEmployeeId,
        status: 'REJECTED',
        reason: 'INVALID_ROW',
        message: `Expected ${csv.headers.length} cells, received ${cells.length}`,
      });

      continue;
    }

    const input: Record<string, unknown> = Object.fromEntries(
      csv.headers.map((header, index) => [header, cells[index]]),
    );

    const managerValue = input.managerExternalId;

    if (typeof managerValue === 'string') {
      input.managerExternalId = managerValue.trim() || null;
    }

    const parsed = provisionEmployeeSchema.safeParse(input);

    if (!parsed.success) {
      rejectedRows.push({
        row,
        externalEmployeeId,
        status: 'REJECTED',
        reason: 'INVALID_ROW',
        message: parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      });

      continue;
    }

    validRows.push({
      row,
      data: parsed.data,
    });
  }

  return { validRows, rejectedRows };
}
