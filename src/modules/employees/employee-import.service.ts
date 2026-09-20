import { parseEmployeeCsv } from './employee-csv.parser.js';
import { validateEmployeeCsv } from './employee-csv.validator.js';
import { detectEmployeeDuplicates } from './employee-csv.duplicates.js';

import type { EmployeeProvisioningService } from './employee-provisioning.service.js';
import type {
  EmployeeImportResult,
  ImportRowResult,
} from './employee-import.types.js';

type ImportContext = {
  tenantId: string;
  sourceSystem: string;
};

export class EmployeeImportService {
  constructor(private readonly provisioning: EmployeeProvisioningService) {}

  async execute(
    csv: string,
    context: ImportContext,
  ): Promise<EmployeeImportResult> {
    const parsed = parseEmployeeCsv(csv);
    const validated = validateEmployeeCsv(parsed);
    const plan = detectEmployeeDuplicates(validated);

    const rows: ImportRowResult[] = [...plan.rejectedRows];

    for (const group of plan.groups) {
      const { primary, duplicateRows } = group;

      try {
        const result = await this.provisioning.execute({
          ...primary.data,
          tenantId: context.tenantId,
          sourceSystem: context.sourceSystem,
        });

        rows.push({
          row: primary.row,
          externalEmployeeId: primary.data.externalEmployeeId,
          status: result.outcome,
        });

        for (const row of duplicateRows) {
          rows.push({
            row,
            externalEmployeeId: primary.data.externalEmployeeId,
            status: 'DUPLICATE',
            duplicateOfRow: primary.row,
          });
        }
      } catch (error: unknown) {
        console.error(
          `Provisioning failed for CSV record ${primary.row}`,
          error,
        );

        for (const row of [primary.row, ...duplicateRows]) {
          rows.push({
            row,
            externalEmployeeId: primary.data.externalEmployeeId,
            status: 'REJECTED',
            reason: 'PROVISIONING_FAILED',
            message: 'Could not provision this employee',
          });
        }
      }
    }

    rows.sort((a, b) => a.row - b.row);

    return {
      totalRows: parsed.rows.length,
      created: rows.filter((row) => row.status === 'CREATED').length,
      updated: rows.filter((row) => row.status === 'UPDATED').length,
      unchanged: rows.filter((row) => row.status === 'UNCHANGED').length,
      duplicates: rows.filter((row) => row.status === 'DUPLICATE').length,
      rejected: rows.filter((row) => row.status === 'REJECTED').length,
      rows,
    };
  }
}
