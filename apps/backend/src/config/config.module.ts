import { Global, Module } from "@nestjs/common";
import { EnvProvider } from "./env";

@Global()
@Module({
  providers: [EnvProvider],
  exports: [EnvProvider],
})
export class ChatrixConfigModule {}
