import type { SystemEmail } from "../../../platform/ports";

/**
 * Correos del sistema de identidad (en español; i18n del correo cuando haya más idiomas). Los enlaces
 * apuntan a la SPA (`NEXO_PUBLIC_URL`). Contienen un token de un solo uso: nunca se registran en logs.
 */
export function verifyEmailMail(to: string, baseUrl: string, token: string): SystemEmail {
  const link = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: "Confirma tu email en Nexo",
    text: `Hola,\n\nConfirma tu dirección de email para activar todas las funciones de Nexo:\n${link}\n\nEl enlace caduca en 48 horas. Si no has creado una cuenta, ignora este mensaje.\n`,
  };
}

export function passwordResetMail(to: string, baseUrl: string, token: string): SystemEmail {
  const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: "Restablece tu contraseña de Nexo",
    text: `Hola,\n\nHas pedido restablecer tu contraseña. Elige una nueva aquí:\n${link}\n\nEl enlace caduca en 1 hora y solo sirve una vez. Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.\n`,
  };
}

export function invitationMail(args: {
  to: string;
  baseUrl: string;
  token: string;
  tenantName: string;
  inviterName: string;
}): SystemEmail {
  const link = `${args.baseUrl}/accept-invitation?token=${encodeURIComponent(args.token)}`;
  return {
    to: args.to,
    subject: `${args.inviterName} te invita a ${args.tenantName} en Nexo`,
    text: `Hola,\n\n${args.inviterName} te ha invitado a unirte a «${args.tenantName}» en Nexo.\nAcepta la invitación aquí:\n${link}\n\nLa invitación caduca en 7 días.\n`,
  };
}

/** Alta manual por el superadmin: el propietario fija su contraseña desde el enlace. */
export function ownerWelcomeMail(args: {
  to: string;
  baseUrl: string;
  token: string;
  tenantName: string;
}): SystemEmail {
  const link = `${args.baseUrl}/reset-password?token=${encodeURIComponent(args.token)}&welcome=1`;
  return {
    to: args.to,
    subject: `Tu espacio «${args.tenantName}» en Nexo está listo`,
    text: `Hola,\n\nHemos creado el espacio «${args.tenantName}» en Nexo y eres su propietario.\nElige tu contraseña para entrar:\n${link}\n\nEl enlace caduca en 7 días.\n`,
  };
}

/** Un usuario que ya tenía cuenta es añadido como propietario de un tenant nuevo. */
export function ownerAddedMail(args: {
  to: string;
  baseUrl: string;
  tenantName: string;
}): SystemEmail {
  return {
    to: args.to,
    subject: `Ahora eres propietario de «${args.tenantName}» en Nexo`,
    text: `Hola,\n\nHas sido añadido como propietario del espacio «${args.tenantName}» en Nexo.\nEntra con tu cuenta de siempre: ${args.baseUrl}/login\n`,
  };
}
