import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const composeUrl = new URL("../docker-compose.yml", import.meta.url);
const compose = await readFile(composeUrl, "utf8");

assert.match(
  compose,
  /^\s*-\s*["']127\.0\.0\.1:5432:5432["']\s*$/m,
  "PostgreSQL deve ser publicado somente em 127.0.0.1:5432",
);
assert.match(
  compose,
  /^\s*-\s*["']127\.0\.0\.1:6379:6379["']\s*$/m,
  "Redis deve ser publicado somente em 127.0.0.1:6379",
);

for (const port of [5432, 6379]) {
  assert.doesNotMatch(
    compose,
    new RegExp(`^\\s*-\\s*["']?(?:0\\.0\\.0\\.0:)?${port}:${port}["']?\\s*$`, "m"),
    `A porta ${port} não pode ser publicada em todas as interfaces`,
  );
}

assert.match(compose, /test:\s*\["CMD-SHELL",\s*"pg_isready\b/, "PostgreSQL deve possuir healthcheck");
assert.match(compose, /test:\s*\["CMD",\s*"redis-cli",\s*"ping"\]/, "Redis deve possuir healthcheck");

console.log("Docker Compose: bindings locais e healthchecks validados.");
