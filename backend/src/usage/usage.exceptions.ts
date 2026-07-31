import { HttpException, HttpStatus } from "@nestjs/common";

export class ReportLimitReachedException extends HttpException {
  constructor(input: {
    plan: string;
    limit: number;
    used: number;
    remaining: number;
    periodEnd: Date | null;
  }) {
    super(
      {
        code: "REPORT_LIMIT_REACHED",
        message: `You have used all ${input.limit} reports included in your ${input.plan} plan.`,
        ...input,
      },
      HttpStatus.PAYMENT_REQUIRED
    );
  }
}

export class ReportGenerationInProgressException extends HttpException {
  constructor() {
    super(
      {
        code: "REPORT_GENERATION_IN_PROGRESS",
        message: "Report generation is already in progress for this report.",
      },
      HttpStatus.CONFLICT
    );
  }
}

export class SubscriptionInactiveException extends HttpException {
  constructor(status: string) {
    super(
      {
        code: "SUBSCRIPTION_INACTIVE",
        message: "Your subscription is not active for new report generation.",
        subscriptionStatus: status,
      },
      HttpStatus.PAYMENT_REQUIRED
    );
  }
}

