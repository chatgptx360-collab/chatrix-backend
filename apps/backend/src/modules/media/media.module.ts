import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { Env } from "../../config/env";
import { STORAGE_DRIVER } from "./storage/storage.token";
import { SupabaseStorageDriver } from "./storage/supabase.driver";
import { S3StorageDriver } from "./storage/s3.driver";
import { LocalStorageDriver } from "./storage/local.driver";
import type { StorageDriver } from "./storage/storage.interface";

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: STORAGE_DRIVER,
      inject: [Env],
      useFactory: (env: Env): StorageDriver => {
        switch (env.STORAGE_DRIVER) {
          case "supabase": return new SupabaseStorageDriver(env);
          case "s3":       return new S3StorageDriver(env);
          case "local":    return new LocalStorageDriver();
          default: {
            const exhaustive: never = env.STORAGE_DRIVER;
            throw new Error(`Unknown STORAGE_DRIVER: ${exhaustive}`);
          }
        }
      },
    },
  ],
  exports: [MediaService, STORAGE_DRIVER],
})
export class MediaModule {}
