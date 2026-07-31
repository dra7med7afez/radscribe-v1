import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { CleanupService } from "./cleanup.service";
import { AuditController } from "./audit.controller";

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, CleanupService],
  exports: [AuditService],
})
export class CommonModule {}
