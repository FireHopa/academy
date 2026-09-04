ALTER TABLE "User"
ADD COLUMN "cpf" TEXT,
ADD COLUMN "phone" TEXT;

CREATE UNIQUE INDEX "User_cpf_key" ON "User"("cpf");
