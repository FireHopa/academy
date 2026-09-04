import { ValidateBy, type ValidationOptions } from "class-validator";

const CPF_FORMATTING = /[.\-\s]/g;

export function normalizeCpf(value: string) {
  return value.replace(CPF_FORMATTING, "");
}

export function isValidCpf(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const checkDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index++) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
}

export function IsCpf(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy({
    name: "isCpf",
    validator: {
      validate: value => isValidCpf(value),
      defaultMessage: () => "CPF inválido",
    },
  }, validationOptions);
}
