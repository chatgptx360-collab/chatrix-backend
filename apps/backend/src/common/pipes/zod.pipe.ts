import { PipeTransform, BadRequestException } from "@nestjs/common";
import { ZodSchema } from "zod";

/**
 * Wires Zod schemas into Nest's `@Body()` validation pipeline.
 * Throws ZodError → handled by ChatrixExceptionFilter into a structured 400.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) throw result.error;
    return result.data;
  }
}
