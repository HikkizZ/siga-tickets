import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

// Cifrado simétrico de credenciales de buzón (Fase A: configuracion_correo.imap_password_cifrado/
// smtp_password_cifrado). No es un hash: hace falta poder recuperar el texto plano para conectarse
// de verdad al buzón IMAP/SMTP, así que ni bcrypt ni un digest sirven aquí (a diferencia de
// Usuario.passwordHash). AES-256-GCM: autenticado (un dato corrupto o cifrado con otra clave falla
// al descifrar en vez de devolver basura silenciosa).
const ALGORITMO = "aes-256-gcm";
const LARGO_IV = 12; // recomendado por GCM (96 bits)
const clave = Buffer.from(env.mailCredentialsKey, "hex");

// Formato autocontenido para una sola columna nvarchar: "iv:authTag:ciphertext", los tres en
// base64. No hace falta guardar el algoritmo aparte (siempre aes-256-gcm en este proyecto).
export function cifrar(texto: string): string {
  const iv = randomBytes(LARGO_IV);
  const cipher = createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${cifrado.toString("base64")}`;
}

export function descifrar(valor: string): string {
  const partes = valor.split(":");
  if (partes.length !== 3) throw new Error("Formato de texto cifrado inválido");
  const [ivB64, authTagB64, cifradoB64] = partes as [string, string, string];

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const cifrado = Buffer.from(cifradoB64, "base64");

  const decipher = createDecipheriv(ALGORITMO, clave, iv);
  decipher.setAuthTag(authTag);
  // Una clave equivocada o un dato corrupto hace que decipher.final() lance (auth tag no calza):
  // el error se propaga como una Error normal, capturable con try/catch, nunca tumba el proceso.
  const texto = Buffer.concat([decipher.update(cifrado), decipher.final()]);
  return texto.toString("utf8");
}
