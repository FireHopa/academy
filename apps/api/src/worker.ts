import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { JobWorkerService } from "./jobs/job-worker.service";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  await app.get(JobWorkerService).start();
  new Logger("AcademyWorker").log("Worker de background iniciado");
}

bootstrap().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
