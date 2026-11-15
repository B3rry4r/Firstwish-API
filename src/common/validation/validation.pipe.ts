import { ValidationError, ValidationPipe } from "@nestjs/common";
import { AppError, ErrorFields } from "../errors/app-error";

/** Flattens class-validator errors into { "path.to.field": "why" }, one plain reason per field. */
export function fieldsOf(errors: ValidationError[], parent = ""): ErrorFields {
  const out: ErrorFields = {};
  for (const e of errors) {
    const path = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) {
      const c = e.constraints;
      out[path] = c.whitelistValidation ? "Not a known field." : Object.values(c)[0];
    }
    if (e.children?.length) Object.assign(out, fieldsOf(e.children, path));
  }
  return out;
}

/** The global pipe: whitelist, refuse unknown fields, transform; failures are 422 with fields. */
export function makeValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => AppError.validation(fieldsOf(errors)),
  });
}
