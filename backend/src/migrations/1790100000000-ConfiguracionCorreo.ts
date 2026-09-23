import type { MigrationInterface, QueryRunner } from "typeorm";

// Fase A (config de correo en BD): reemplaza IMAP_*/SMTP_* de variables de entorno por una fila
// administrable (PUT /correo/config, solo admin). Un único buzón conocido (decisión 0.1 del
// diseño): sin CRUD de múltiples buzones, la tabla nace vacía y el servicio la puebla con un único
// id fijo (ver entities/ConfiguracionCorreo.ts::CONFIGURACION_CORREO_ID) la primera vez que se
// llama PUT /correo/config. Contraseñas cifradas (AES-256-GCM, services/cifrado.service.ts), nunca
// en texto plano ni como hash irreversible: hace falta poder recuperarlas para conectarse de verdad.
export class ConfiguracionCorreo1790100000000 implements MigrationInterface {
  name = "ConfiguracionCorreo1790100000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE configuracion_correo (
        id                     uniqueidentifier NOT NULL PRIMARY KEY,
        imap_host              nvarchar(255),
        imap_port              int,
        imap_user              nvarchar(255),
        imap_password_cifrado  nvarchar(500),
        imap_folder            nvarchar(120),
        imap_tls               bit NOT NULL DEFAULT 1,
        imap_habilitado        bit NOT NULL DEFAULT 0,
        smtp_host              nvarchar(255),
        smtp_port              int,
        smtp_user              nvarchar(255),
        smtp_password_cifrado  nvarchar(500),
        smtp_tls               bit NOT NULL DEFAULT 1,
        smtp_habilitado        bit NOT NULL DEFAULT 0,
        correo_desde           nvarchar(255),
        dominio                nvarchar(120),
        actualizado_en         datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_por_id     uniqueidentifier REFERENCES usuario(id)
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE configuracion_correo`);
  }
}
