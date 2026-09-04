import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AdminService } from "../src/admin/admin.service";
import { CreateStudentDto } from "../src/admin/dto/student.dto";
import { isValidCpf, normalizeCpf } from "../src/common/cpf";
import { recorded, rejectsWith } from "./helpers";
import { BadRequestException } from "@nestjs/common";

test("validador aceita CPF válido com ou sem máscara e normaliza para onze dígitos", () => {
  assert.equal(isValidCpf("52998224725"), true);
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(normalizeCpf(" 529.982.247-25 "), "52998224725");
});

test("validador rejeita dígitos verificadores incorretos, sequências repetidas e caracteres estranhos", () => {
  assert.equal(isValidCpf("52998224724"), false);
  assert.equal(isValidCpf("00000000000"), false);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("abc529.982.247-25"), false);
  assert.equal(isValidCpf("5299822472"), false);
});

test("DTO aceita CPF formatado e entrega somente os dígitos ao serviço", async () => {
  const dto = plainToInstance(CreateStudentDto, {
    name: "Aluno Teste",
    email: "aluno@example.com",
    cpf: "529.982.247-25",
  });

  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.cpf, "52998224725");
});

test("DTO devolve uma mensagem específica para CPF matematicamente inválido", async () => {
  const dto = plainToInstance(CreateStudentDto, {
    name: "Aluno Teste",
    email: "aluno@example.com",
    cpf: "529.982.247-24",
  });

  const errors = await validate(dto);
  const cpfError = errors.find(error => error.property === "cpf");

  assert.equal(cpfError?.constraints?.isCpf, "CPF inválido");
});

test("serviço rejeita CPF inválido antes de consultar ou gravar usuário", async () => {
  const findUnique = recorded(async () => null);
  const create = recorded(async () => ({}));
  const service = new AdminService({ user: { findUnique, create } } as any, {} as any);

  await rejectsWith(service.createStudent({
    name: "Aluno Inválido",
    email: "invalido@example.com",
    password: "senha-segura-2026",
    cpf: "00000000000",
  }), BadRequestException, /CPF inválido/);

  assert.equal(findUnique.calls.length, 0);
  assert.equal(create.calls.length, 0);
});

test("frontend mantém máscara, valida os dígitos e envia CPF normalizado", () => {
  const source = readFileSync(resolve(process.cwd(), "apps/web/app/admin/students/page.tsx"), "utf8");

  assert.match(source, /function validCpf\(value: string\)/);
  assert.match(source, /\^\(\\d\)\\1\{10\}\$/);
  assert.match(source, /Digite um CPF válido/);
  assert.match(source, /cpf: digits\(cpf\)/);
});
