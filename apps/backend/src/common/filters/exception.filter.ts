import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from "@nestjs/common";
import { ZodError } from "zod";
import { ChatrixError, ErrorCode, ApiError } from "@chatrix/shared/errors";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Single global filter — translates every error into the stable ApiError
 * shape that `@chatrix/shared` clients understand.
 */
@Catch()
export class ChatrixExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HTTP");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    const { status, body } = this.normalize(exception);

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${status} ${body.code}`, (exception as Error)?.stack);
    } else if (status >= 400) {
      this.logger.warn(`${req.method} ${req.url} → ${status} ${body.code}: ${body.message}`);
    }

    res.status(status).send(body);
  }

  private normalize(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof ChatrixError) {
      return {
        status: exception.status,
        body: { code: exception.code, message: exception.message, details: exception.details },
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: 400,
        body: {
          code: ErrorCode.VALIDATION,
          message: "Invalid input.",
          details: { issues: exception.flatten() },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      const message =
        typeof r === "string" ? r : (r as { message?: string }).message ?? exception.message;
      return {
        status,
        body: {
          code: status === 401 ? ErrorCode.UNAUTHORIZED
              : status === 403 ? ErrorCode.FORBIDDEN
              : status === 404 ? ErrorCode.NOT_FOUND
              : status === 429 ? ErrorCode.RATE_LIMITED
              : ErrorCode.UNKNOWN,
          message: Array.isArray(message) ? message.join(", ") : String(message),
        },
      };
    }

    return {
      status: 500,
      body: { code: ErrorCode.UNKNOWN, message: "Internal server error" },
    };
  }
}
