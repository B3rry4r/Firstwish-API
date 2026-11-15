import { HttpException, HttpStatus } from "@nestjs/common";

export type ErrorFields = Record<string, string>;

/**
 * The one error type modules throw. The global filter turns it into
 * { error: { code, message, fields?, requestId } } with this status.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus | number,
    readonly code: string,
    message: string,
    readonly fields?: ErrorFields,
  ) {
    super({ code, message, fields }, status);
  }

  static validation(fields: ErrorFields, message = "Some fields need fixing."): AppError {
    return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", message, fields);
  }
  static notFound(message = "Not found."): AppError {
    return new AppError(HttpStatus.NOT_FOUND, "not_found", message);
  }
  static unauthorized(message = "Sign in to continue."): AppError {
    return new AppError(HttpStatus.UNAUTHORIZED, "unauthorized", message);
  }
  static forbidden(message = "You cannot do that."): AppError {
    return new AppError(HttpStatus.FORBIDDEN, "forbidden", message);
  }
  static conflict(code: string, message: string): AppError {
    return new AppError(HttpStatus.CONFLICT, code, message);
  }
}
