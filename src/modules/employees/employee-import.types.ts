export type ImportRowResult =
  | {
      row: number;
      externalEmployeeId: string;
      status: 'CREATED' | 'UPDATED' | 'UNCHANGED';
    }
  | {
      row: number;
      externalEmployeeId: string;
      status: 'DUPLICATE';
      duplicateOfRow: number;
    }
  | {
      row: number;
      externalEmployeeId?: string;
      status: 'REJECTED';
      reason: 'INVALID_ROW' | 'CONFLICTING_DUPLICATE' | 'PROVISIONING_FAILED';
      message: string;
    };

export type EmployeeImportResult = {
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  rejected: number;
  rows: ImportRowResult[];
};
