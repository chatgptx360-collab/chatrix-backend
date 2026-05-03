import { Global, Module } from "@nestjs/common";
import { EmailService } from "./email.service";

/**
 * Email is global so any feature can send a transactional message
 * (auth, notifications, admin alerts) without re-importing.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
