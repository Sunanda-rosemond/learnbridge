import type { RequestHandler } from 'express';

import { EmployeeCsvError } from './employee-csv.parser.js';
import type { EmployeeImportService } from './employee-import.service.js';

type ImportContext = {
  tenantId: string;
  sourceSystem: string;
};

export function createEmployeeImportHandler(
  importer: EmployeeImportService,
  context: ImportContext,
): RequestHandler {
  return async (req, res, next) => {
    if (!req.is('text/csv')) {
      res.status(415).json({
        error: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Send the file using Content-Type: text/csv',
      });
      return;
    }

    if (typeof req.body !== 'string') {
      res.status(400).json({
        error: 'INVALID_CSV',
        message: 'A CSV request body is required',
      });
      return;
    }

    try {
      const result = await importer.execute(req.body, context);

      res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof EmployeeCsvError) {
        res.status(400).json({
          error: 'INVALID_CSV',
          message: error.message,
        });
        return;
      }

      next(error);
    }
  };
}
