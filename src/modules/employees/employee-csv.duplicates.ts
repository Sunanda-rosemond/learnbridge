import type {
  EmployeeCsvValidationResult,
  ValidatedEmployeeRow,
} from './employee-csv.validator.js';

import type { ImportRowResult } from './employee-import.types.js';

type RejectedRow = Extract<ImportRowResult, { status: 'REJECTED' }>;

export type EmployeeImportGroup = {
  primary: ValidatedEmployeeRow;
  duplicateRows: number[];
};

export type EmployeeImportPlan = {
  groups: EmployeeImportGroup[];
  rejectedRows: RejectedRow[];
};

function hasSameData(
  first: ValidatedEmployeeRow,
  second: ValidatedEmployeeRow,
): boolean {
  return (
    first.data.externalEmployeeId === second.data.externalEmployeeId &&
    first.data.workEmail === second.data.workEmail &&
    first.data.employmentStatus === second.data.employmentStatus &&
    first.data.managerExternalId === second.data.managerExternalId
  );
}

export function detectEmployeeDuplicates(
  validation: EmployeeCsvValidationResult,
): EmployeeImportPlan {
  const groups: EmployeeImportGroup[] = [];
  const rejectedRows = [...validation.rejectedRows];

  const rowsByEmployee = new Map<string, ValidatedEmployeeRow[]>();

  for (const row of validation.validRows) {
    const id = row.data.externalEmployeeId;
    const existingRows = rowsByEmployee.get(id);

    if (existingRows) {
      existingRows.push(row);
    } else {
      rowsByEmployee.set(id, [row]);
    }
  }

  // A rejected row with a known identity blocks that employee's
  // other rows: we cannot safely assume the valid row is authoritative.
  const invalidRowsByEmployee = new Map<string, number[]>();

  for (const rejected of validation.rejectedRows) {
    const id = rejected.externalEmployeeId;

    if (!id) continue;

    const rowNumbers = invalidRowsByEmployee.get(id) ?? [];
    rowNumbers.push(rejected.row);
    invalidRowsByEmployee.set(id, rowNumbers);
  }

  for (const [id, employeeRows] of rowsByEmployee) {
    const [primary, ...additionalRows] = employeeRows;

    if (!primary) continue;

    const invalidRowNumbers = invalidRowsByEmployee.get(id) ?? [];

    const hasConflict =
      invalidRowNumbers.length > 0 ||
      additionalRows.some((row) => !hasSameData(primary, row));

    if (hasConflict) {
      const relatedRows = [
        ...employeeRows.map((row) => row.row),
        ...invalidRowNumbers,
      ].sort((a, b) => a - b);

      for (const row of employeeRows) {
        rejectedRows.push({
          row: row.row,
          externalEmployeeId: id,
          status: 'REJECTED',
          reason: 'CONFLICTING_DUPLICATE',
          message:
            `Employee ${id} has conflicting or invalid entries ` +
            `in rows ${relatedRows.join(', ')}`,
        });
      }

      continue;
    }

    groups.push({
      primary,
      duplicateRows: additionalRows.map((row) => row.row),
    });
  }

  return {
    groups,
    rejectedRows: rejectedRows.sort((a, b) => a.row - b.row),
  };
}
