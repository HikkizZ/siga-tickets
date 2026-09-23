import { describe, expect, it } from "vitest";
import { cifrar, descifrar } from "./cifrado.service.js";

// Unitario puro, sin BD (mismo espíritu que sla/horasHabiles.test.ts): usa la MAIL_CREDENTIALS_KEY
// de prueba que fija vitest.config.ts.
describe("cifrado.service", () => {
  it("cifrar -> descifrar devuelve el texto original", () => {
    const original = "una-contraseña-de-buzón-cualquiera-123";
    const cifrado = cifrar(original);
    expect(descifrar(cifrado)).toBe(original);
  });

  it("dos cifrados del mismo texto dan resultados distintos (IV aleatorio)", () => {
    const original = "misma-contraseña";
    const a = cifrar(original);
    const b = cifrar(original);
    expect(a).not.toBe(b);
    expect(descifrar(a)).toBe(original);
    expect(descifrar(b)).toBe(original);
  });

  it("el formato de salida es autocontenido: iv:authTag:ciphertext en base64", () => {
    const cifrado = cifrar("texto");
    const partes = cifrado.split(":");
    expect(partes).toHaveLength(3);
    for (const parte of partes) expect(() => Buffer.from(parte, "base64")).not.toThrow();
  });

  it("descifrar un valor corrupto falla de forma controlada (no crashea el proceso)", () => {
    const cifrado = cifrar("texto original");
    const corrupto = cifrado.slice(0, -4) + "AAAA"; // se altera el ciphertext/authTag en base64
    expect(() => descifrar(corrupto)).toThrow();
  });

  it("descifrar con un formato inválido (sin los 3 segmentos) falla de forma controlada", () => {
    expect(() => descifrar("no-es-un-texto-cifrado-valido")).toThrow();
  });

  it("cifra y descifra un texto vacío sin problemas", () => {
    const cifrado = cifrar("");
    expect(descifrar(cifrado)).toBe("");
  });
});
