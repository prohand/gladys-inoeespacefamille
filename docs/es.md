# iNoé Espace Famille para Gladys

Esta integración conecta Gladys con su **iNoé Espace Famille** (el portal familiar de AIGA que
usan muchos municipios y centros franceses: comedor escolar, actividades extraescolares, centro
de ocio, guardería). Lee, como usted lo haría en el portal:

- el **importe por pagar** y las **facturas** pendientes;
- las **reservas** de cada niño (hoy, mañana, los días siguientes);
- las **noticias** publicadas por el centro;
- el número de **documentos** que el centro espera.

La integración **solo lee**: nunca reserva, cancela ni paga nada. Los pagos y las reservas
siguen en el portal.

Es una integración **en la nube**: pasa por los servidores de AIGA en Internet, así que Gladys
necesita acceso a Internet.

Se necesita Gladys 5.3 o posterior.

## Configuración

En Gladys, abra **Integraciones**, instale **iNoé Espace Famille** y complete la pantalla de
configuración:

| Campo                                     | Qué poner                                                                                                                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dirección del portal                      | La dirección de la página de inicio de sesión del portal, copiada tal cual: `https://espacefamille.aiga.fr/index.html?dossier=1626256#connexion…` o `https://espacefamille.aiga.fr/11578177`. También vale solo el número (`1626256`). |
| Correo electrónico                        | El correo con el que inicia sesión en el portal.                                                                                                                                                                                       |
| Contraseña                                | La contraseña del portal. Solo se envía al servidor de inicio de sesión de AIGA y nunca se escribe en los registros.                                                                                                                   |
| Intervalo de actualización (min)          | Cada cuántos minutos se lee el portal (60 por defecto, de 15 a 1440).                                                                                                                                                                  |
| Recordatorio de factura (días)            | Cuántos días antes del vencimiento se activa el disparador «Una factura vence pronto» (3 por defecto).                                                                                                                                 |
| Planificación leída por adelantado (días) | Cuántos días de la planificación de cada niño se leen, hoy incluido (7 por defecto).                                                                                                                                                   |
| Zona horaria                              | Lo que decide «hoy» y «mañana»: `Europe/Paris` por defecto, `Indian/Reunion`, `America/Martinique`… para ultramar.                                                                                                                     |

Pulse **Probar la conexión**: la respuesta indica el nombre del centro, el importe pendiente y,
para cada niño, los días reservados y la próxima reserva.

Abra después la pestaña **Descubrimiento** de la integración y cree los dispositivos.

> **¿Dónde está la dirección del portal?** En el correo de creación de cuenta que envió su
> centro, o en la barra de direcciones del navegador cuando está en el portal: es el número
> después de `dossier=` (o de `espacefamille.aiga.fr/`).

## Dispositivos

### La familia

Un dispositivo con el nombre del centro (y de su familia):

| Función            | Valor                                                     |
| ------------------ | --------------------------------------------------------- |
| Amount due         | Importe pendiente de pago, en euros                       |
| Unpaid invoices    | Número de facturas por pagar                              |
| Next due date      | Fecha de vencimiento de la próxima factura (`AAAA-MM-DD`) |
| Documents expected | Número de documentos que espera el centro                 |
| Latest news        | Título de la última noticia del centro                    |

### Cada niño

Un dispositivo por niño («Léa – iNoé»):

| Función           | Valor                                                     |
| ----------------- | --------------------------------------------------------- |
| Booked today      | 1 si el niño tiene al menos una reserva hoy, si no 0      |
| Booked tomorrow   | 1 si el niño tiene al menos una reserva mañana, si no 0   |
| Today             | Las actividades reservadas hoy («Cantine, Garderie soir») |
| Tomorrow          | Las actividades reservadas mañana                         |
| Days booked ahead | Número de días reservados en el periodo leído             |

Una ausencia o una plaza en lista de espera no cuenta como reserva.

Cada dispositivo muestra la insignia **nube**; pasa a **inaccesible** cuando el portal no
responde.

## Disparadores de escena

En una escena, elija el disparador **Integraciones → iNoé Espace Famille**:

| Clave              | Cuándo                                                            | Variables                                                         |
| ------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `new_invoice`      | Aparece una nueva factura por pagar                               | `number`, `label`, `structure`, `amount`, `due_date`              |
| `invoice_due_soon` | Una factura vence pronto (una vez por factura)                    | las mismas + `days_left`                                          |
| `booking_changed`  | Se reserva o cancela una actividad en la planificación de un niño | `child_name`, `date`, `activity`, `change` (`booked`/`cancelled`) |
| `new_message`      | El centro publica una nueva noticia                               | `title`, `date`                                                   |

`booking_changed` se puede filtrar por niño y por tipo de cambio. En las acciones siguientes,
use por ejemplo `{{triggerEvent.data.amount}}`.

En la primerísima lectura de una cuenta no se señala nada (si no, cada factura ya existente
sería «nueva») — salvo una factura que ya vence pronto.

## Acciones de escena

| Clave           | Qué hace                                                           | Resultados                      |
| --------------- | ------------------------------------------------------------------ | ------------------------------- |
| `refresh`       | Lee el portal ahora mismo, sin esperar al intervalo                | `amount_due`, `unpaid_invoices` |
| `check_booking` | Indica si un niño tiene reserva hoy o mañana, y en qué actividades | `booked`, `activities`          |

Ejemplo: cada noche a las 20 h, `check_booking` para Léa, mañana; si `booked` es verdadero,
enviar «Mañana: {{…activities}}» por Telegram.

## Widget del panel

El widget **Espacio familiar** (`family_space`) muestra el importe pendiente (en directo), la
próxima factura (naranja cuando se acerca el vencimiento, rojo cuando ha pasado), el día de cada
niño hoy y mañana, y los documentos esperados. El botón **Actualizar** vuelve a leer el portal;
**Abrir el portal** abre su Espace Famille.

## Solución de problemas

| Mensaje                                       | Qué hacer                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| «iNoé no reconoce esta dirección de portal»   | Copie de nuevo la dirección del correo de su centro.                               |
| «El portal rechazó el correo o la contraseña» | Inicie sesión en el propio portal; si la contraseña cambió, actualícela en Gladys. |
| «El portal iNoé está en mantenimiento»        | Nada que hacer: se reintentará en la próxima actualización.                        |
| Un niño muestra «planificación ilegible»      | Quizá el centro cerró una actividad. El resto de la información sigue al día.      |

El portal no tiene API pública: la integración usa los mismos intercambios que el sitio web. Si
AIGA cambia su sitio, puede ser necesaria una actualización de la integración.

## Privacidad

- La contraseña solo se envía a `ism.aiga.fr` (el servidor de inicio de sesión de AIGA).
- No se envía nada a otro sitio que a los servidores de AIGA y a su Gladys.
- Solo una pequeña memoria (números de facturas y noticias, reservas ya vistas) se guarda en el
  volumen `/data` de la integración, para no señalar dos veces lo mismo.
