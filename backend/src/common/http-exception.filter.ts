import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

// Known Prisma error codes → HTTP responses, so constraint races surface as
// meaningful 4xx instead of raw 500s (duck-typed on `code` to avoid coupling
// to the generated client's error classes).
const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: "A record with this value already exists" },
  P2003: { status: HttpStatus.CONFLICT, message: "Operation blocked by related records" },
  P2025: { status: HttpStatus.NOT_FOUND, message: "Record not found" },
};

// Consistent error envelope: { statusCode, message, requestId }.
// Unexpected errors are logged with their stack but never leaked to the client.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const requestId: string | undefined = req?.id;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";
    let details: Record<string, unknown> = {};

    const prismaMapped = PRISMA_ERROR_MAP[(exception as any)?.code as string];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === "string"
          ? body
          : ((body as any)?.message ?? exception.message);
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const { message: _message, statusCode: _statusCode, error: _error, ...safe } = body as any;
        details = safe;
      }
    } else if (prismaMapped) {
      status = prismaMapped.status;
      message = prismaMapped.message;
    } else {
      this.logger.error(
        `Unhandled exception on ${req?.method} ${req?.url} (requestId=${requestId})`,
        (exception as Error)?.stack
      );
    }

    res.status(status).json({ statusCode: status, message, ...details, requestId });
  }
}
