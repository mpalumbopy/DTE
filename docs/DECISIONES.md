# DECISIONES (ADRs cortos)

Registro de decisiones tomadas cuando el plan (`docs/PLAN.md`) no cubre un caso explícitamente,
o cuando una librería listada se sustituye por incompatibilidad (regla 0.1.9 del plan).

## ADR-000 — Formato

Cada entrada: fecha, fase, contexto, decisión, alternativas descartadas.

---

## ADR-001 — Insumos de referencia faltantes (DDL y XML) al iniciar F0

- **Fecha:** 2026-07-22
- **Fase:** F0
- **Contexto:** El plan asume ya provistos `db/modelo_datos_psdte.sql` y un XML firmado de referencia del
  pagaré (perfil `http://acraiz.gov.py/pagare/arhivos-en-xsd`). Ninguno de los dos estaba disponible en el
  repositorio ni en los adjuntos al arrancar. Se consultó al usuario, quien confirmó que los subiría antes
  de ejecutar F1 (base de datos) y F4 (xml-engine).
- **Decisión:** F0 (scaffolding) no depende de estos archivos y se ejecuta primero. F1 y F4 quedan
  bloqueados hasta recibir los insumos; se documentará aquí si en su lugar se optó por construir una
  versión provisional propia.
- **Alternativas descartadas:** construir un DDL/XML de referencia inventado desde la sola lectura del plan
  y la normativa citada — se descarta por el riesgo de introducir un esquema o perfil XML incorrecto para
  un sistema con implicancias legales/probatorias (Ley 6822/2021).
- **Actualización 2026-07-22 (F1):** el usuario proveyó `db/modelo_datos_psdte.sql`. F1 queda desbloqueada
  y se ejecuta con el DDL real. El XML de referencia firmado sigue pendiente: F4 (xml-engine) permanece
  bloqueada hasta recibirlo.
- **Actualización 2026-07-22 (cierre F4):** el usuario proveyó el XML de referencia firmado
  (`firma_pagare_psdte_NO_TOCAR.xml`) — un intento previo había sido, de nuevo, el "Diploma Digital"
  brasileño no relacionado, descartado sin usar. F4 queda desbloqueada y se cierra por completo; ver
  ADR-014 para el detalle de la estructura real observada y las decisiones tomadas a partir de ella.

## ADR-002 — Docker no disponible en el sandbox de desarrollo remoto (F0)

- **Fecha:** 2026-07-22
- **Fase:** F0
- **Contexto:** `dockerd` no puede arrancar en este entorno de ejecución remoto (contenedor efímero sin
  soporte para Docker anidado: `ulimit: error setting limit (Operation not permitted)`). El plan pide
  levantar Postgres/Redis/MailHog vía `infra/dev/docker-compose.yml`.
- **Decisión:** `infra/dev/docker-compose.yml` se mantiene sin cambios (es correcto para una máquina de
  desarrollo real o CI con Docker). En este sandbox se usan los binarios nativos ya instalados
  (`postgresql-16`, `redis-server`) para correr migraciones/tests localmente durante el desarrollo de las
  fases. No afecta el DoD real de F0 en un entorno con Docker funcional; se documenta para que quien
  retome el trabajo en otra máquina no se confunda si ve Postgres/Redis corriendo fuera de contenedores.
  MailHog no tiene equivalente nativo instalado; para probar notificaciones (F11) se evaluará una
  alternativa (p. ej. `maildev` vía npx, o mock del transporte SMTP en tests) documentada en su momento.

## ADR-003 — Catálogos de roles/permisos y geografía no incluidos en el DDL de referencia (F1)

- **Fecha:** 2026-07-22
- **Fase:** F1
- **Contexto:** `db/modelo_datos_psdte.sql` sección 16 ("datos semilla mínimos") no trae `INSERT` para
  `cat_rol`, `cat_permiso` ni `cat_rol_permiso` (solo los códigos de ejemplo en un comentario de la
  definición de tabla). Tampoco trae departamento/distrito/ciudad de Asunción — el catálogo geográfico
  oficial DGEEC no está disponible.
- **Decisión:** se sembraron roles y permisos propios (`db/seeds/data/03_roles_permisos.sql`) siguiendo los
  códigos de ejemplo del comentario (`ADMIN_PSDTE, OPERADOR_EMISION, TENEDOR, DEUDOR, AUTORIDAD, AUDITOR`)
  más `CONSULTA_PUBLICA` como rol lógico no asignable, con una matriz de permisos razonable acorde a la
  sección 5.2 del plan (contrato de API) y a la segregación ADMIN_PSDTE↔operación de DTE (sección 10). Para
  geografía se sembró únicamente Asunción/Capital con códigos provisionales (0/1/1) —
  `db/seeds/data/02_catalogos_geograficos.sql`.
- **Punto de reemplazo:** cuando se disponga del catálogo oficial de roles/permisos y del geográfico DGEEC,
  reemplazar estos seeds sin tocar el modelo (las tablas ya están listas para cualquier código).

## ADR-004 — Ambigüedad de `fn_aplicar_evento` para transiciones con múltiples filas de `condicion` (F1, relevante para F7)

- **Fecha:** 2026-07-22
- **Fase:** F1 (detectado en el test de camino feliz), aplica a F7 (Pagos)
- **Contexto:** `cat_transicion` seedea dos filas para `(estado_origen=1, tipo_evento=4/PAGO)`: una con
  `condicion='saldo > 0'` → destino PAGADO_PARCIAL, otra con `condicion='saldo = 0'` → destino
  PAGADO_TOTAL. La función `fn_aplicar_evento` (tal como está en el DDL de referencia, sección 15) NO
  evalúa el texto de `condicion` contra el saldo real: hace `SELECT estado_destino ... LIMIT 1` sin
  `ORDER BY`, por lo que el motor puede devolver cualquiera de las dos filas (en la práctica, Postgres usó
  el índice único `(estado_origen, tipo_evento, condicion)` y devolvió la fila que ordena primero
  alfabéticamente por `condicion`, es decir `'saldo = 0'`, no la de inserción).
- **Decisión (F1):** no se modifica `fn_aplicar_evento` (es el núcleo de control exclusivo dado por el DDL
  de referencia; la regla del plan sección 0.1.5 prohíbe degradar invariantes para pasar un test). El test
  de F1 (`fn_aplicar_evento: camino feliz`) usa ENDOSO en lugar de PAGO para el aserto determinístico,
  dejando esta nota para F7.
- **Acción requerida en F7:** `PagosModule`/`EventosService` deberá pasar el saldo resultante ya calculado
  y una forma de que la transición sea unívoca — opciones a evaluar en su momento: (a) que el `EventosService`
  calcule el saldo antes de llamar a `fn_aplicar_evento` y la función reciba el `estado_destino` ya resuelto
  en lugar de derivarlo él mismo, o (b) extender `fn_aplicar_evento` para evaluar `condicion` contra un
  parámetro `p_saldo_resultante` cuando `tipo_evento = PAGO`. Se decidirá y documentará aquí al llegar a F7.

## ADR-005 — Escenario demo completo (DTE emitido+endosado+pagado/cancelado) diferido a F7 (F1)

- **Fecha:** 2026-07-22
- **Fase:** F1
- **Contexto:** el plan sección 4.2 pide en los seeds de F1 un "escenario demo completo: 1 DTE emitido + 1
  endosado + 1 pagado/cancelado (replicando el XML de referencia)". Construir ese escenario correctamente
  requiere: (a) el XML de referencia firmado (aún no provisto, ver ADR-001), y (b) los servicios de
  aplicación de emisión/eventos/firma (F5-F7), ya que insertar manualmente filas de `firma`/`certificado`
  válidas en SQL puro sin el simulador de F5 produciría datos ficticios que no representan un DTE
  realmente firmado, contradiciendo el propósito del escenario ("para que la UI muestre datos reales").
- **Decisión:** F1 siembra catálogos, parámetros, integraciones y usuarios demo (sin el escenario de DTE).
  El escenario demo completo se añade como seed/bootstrap al cierre de F7, invocando los servicios reales
  (`EmisionService`/`EventosService` sobre el simulador de F5) en lugar de INSERTs directos, siempre detrás
  de `SEED_DEMO=true`.

## ADR-006 — Tests de integración de F1 contra Postgres nativo en lugar de Testcontainers (F1)

- **Fecha:** 2026-07-22
- **Fase:** F1
- **Contexto:** el plan sección 12 especifica Testcontainers (PG+Redis) para los tests de integración.
  Testcontainers necesita Docker, no disponible en este sandbox (ver ADR-002).
- **Decisión:** los tests de invariantes de F1 (`apps/api/test/db/invariantes-f1.e2e-spec.ts`) corren con
  `pg` directo contra una base `psdte_test` real (nativa en este sandbox), usando `.env.test` +
  `pnpm --filter @psdte/api db:reset:test` antes de `pnpm --filter @psdte/api test:e2e`. En CI (GitHub
  Actions, con Docker disponible) se agregó al workflow la creación de `psdte_test` sobre el mismo servicio
  `postgres` ya definido, sin necesitar Testcontainers tampoco — es un ajuste igualmente válido y más
  liviano que Testcontainers para este proyecto (no requiere levantar contenedores por test). Se mantiene
  como patrón para F7 (tests de concurrencia) y sucesivas fases de integración, salvo que una fase
  requiera específicamente el aislamiento por contenedor que ofrece Testcontainers.

## ADR-007 — Columnas de familia de sesión para rotación de refresh (F2)

- **Fecha:** 2026-07-22
- **Fase:** F2
- **Contexto:** el plan (sección 0.4 y 5.2) exige refresh rotativo con detección de reuso ("revoca
  familia"). La tabla `sesion` del DDL de referencia no tiene columnas para modelar la cadena de
  rotación (no hay `familia_id` ni referencia a la sesión que reemplaza a otra).
- **Decisión:** migración `016_sesion_familia.sql` agrega `familia_id UUID` (compartido por todas las
  sesiones nacidas del mismo login; se propaga en cada rotación) y `reemplazada_por_id UUID` (apunta a la
  sesión que la reemplazó). Al detectar uso de un refresh cuya sesión ya tiene `revocada_en` o
  `reemplazada_por_id` distinto de NULL, `AuthService` revoca todas las sesiones con el mismo `familia_id`.
- **Alternativas descartadas:** una tabla aparte `sesion_familia`; se descarta por ser más compleja sin
  aportar nada que dos columnas no resuelvan para este caso de uso.

## ADR-008 — `"incremental": true` de TypeScript removido del tsconfig base (F2)

- **Fecha:** 2026-07-22
- **Fase:** F2
- **Contexto:** con `incremental: true` en `tsconfig.base.json`, cada paquete comparte un único
  `tsconfig.tsbuildinfo` entre su script `build` (`tsc`/`nest build`, con emisión) y su script `typecheck`
  (`tsc --noEmit`, sin emisión). Correr `typecheck` antes de `build` dejaba el `tsbuildinfo` en un estado
  que hacía que la siguiente corrida de `build` no reemitiera `.js` (solo quedaban los `.d.ts`), rompiendo
  `nest build` de forma intermitente y silenciosa (exit code 0, sin `dist/main.js`).
- **Decisión:** se quitó `incremental` de `tsconfig.base.json`. Los paquetes son lo bastante chicos como
  para que el costo de una recompilación completa sea despreciable; a cambio se elimina una clase entera
  de fallas de build intermitentes. `apps/web` mantiene su propio `incremental: true` porque `next build`
  no comparte ese `tsbuildinfo` con ningún script `tsc --noEmit` (su `typecheck` no interfiere).
- **Nota operativa:** si en algún momento se reintroduce `incremental` para acelerar builds grandes,
  usar `tsBuildInfoFile` distintos para `build` y `typecheck` (p. ej. `dist/.tsbuildinfo` vs
  `.typecheck.tsbuildinfo`) para no repetir este problema.

## ADR-009 — `.env.test` se commitea (excepción explícita en `.gitignore`)

- **Fecha:** 2026-07-22
- **Fase:** F2
- **Contexto:** el workflow de CI (`db:reset:test`, `test:e2e`) necesita `.env.test` con `DATABASE_URL`
  (`psdte_test`), `APP_ENCRYPTION_KEY` y un par JWT RS256, pero el patrón `.env.*` de `.gitignore` lo
  excluía y CI no tiene forma de generarlo sin secretos reales.
- **Decisión:** `.env.test` contiene únicamente valores fijos de prueba (clave RS256 y `APP_ENCRYPTION_KEY`
  generados solo para tests, `HMAC_CALLBACK_SECRET=test-hmac-secret`, etc.) — nada que proteja datos reales
  ni un entorno expuesto. Se agrega `!.env.test` a `.gitignore` y se commitea. **Nunca** reutilizar estos
  valores en `.env` de producción/staging.
- **Alternativas descartadas:** generar `.env.test` en un paso de CI (más pasos, sin beneficio real ya que
  los valores no son secretos); usar GitHub Secrets (innecesario para claves que no protegen nada real).

## ADR-010 — Condición de carrera real en el encadenado de `auditoria_log` con la tabla vacía (F3)

- **Fecha:** 2026-07-22
- **Fase:** F3 (detectado al agregar el e2e de catálogos/personas, que hizo correr 3 apps de prueba en
  paralelo contra la misma base `psdte_test` recién reseteada)
- **Contexto:** `AuditoriaService.registrar` (F2) serializaba las inserciones bloqueando
  (`SELECT ... FOR UPDATE`) la última fila de `auditoria_log` antes de insertar la siguiente. Con la tabla
  **vacía**, esa consulta no devuelve ninguna fila, así que no hay nada que bloquear: dos transacciones
  concurrentes (dos instancias de la API arrancando a la vez, o en este caso dos procesos de test) pueden
  ejecutar la primera inserción al mismo tiempo, ambas con `hash_anterior = NULL`, rompiendo la cadena
  (invariante I5). El test `auditoria_log encadena hashes` lo detectó de forma intermitente
  (`hash_anterior` esperado vs. `null` recibido).
- **Decisión:** `AuditoriaService.registrar` ahora toma primero un advisory lock de transacción
  (`SELECT pg_advisory_xact_lock($1)` con una clave fija) antes de leer la última fila e insertar. Este
  lock sí serializa aunque la tabla esté vacía, y se libera automáticamente al terminar la transacción
  (commit o rollback) — no requiere liberarlo a mano.
- **Nota:** este mismo patrón (bloquear un recurso que puede no tener filas) habrá que tenerlo en cuenta si
  alguna función futura necesita "encadenar" sobre una tabla que empieza vacía sin pasar por
  `fn_aplicar_evento` (que sí es seguro porque siempre bloquea la fila de `dte`, que ya existe).

## ADR-011 — F4 (xml-engine) ejecutada parcialmente mientras se espera el XML de referencia

- **Fecha:** 2026-07-22
- **Fase:** F4
- **Contexto:** F4 sigue bloqueada por el XML de referencia firmado (ver ADR-001 y su actualización).
  Pero no todo F4 depende de ese archivo: C14N exclusivo, hash SHA-256 y la construcción/validación de
  firmas XAdES-T son estándares W3C/ETSI genéricos que no dependen del perfil específico del pagaré — solo
  el `builder` (genera el XML del perfil desde objetos de dominio), el `validator` semántico y
  `schema/pagare-dte.provisional.xsd` (construido por ingeniería inversa del XML) sí lo necesitan.
- **Decisión:** se construyen ahora `packages/xml-engine/src/{c14n,hash,xades}` (con tests reales, 92 %
  de cobertura), porque F5 (crypto-providers/simulador) los necesita para el `FirmaSimulador` y
  `TsaSimulador`. `builder/`, `validator/` y `schema/pagare-dte.provisional.xsd` quedan pendientes hasta
  recibir el XML correcto; F4 se cierra formalmente recién entonces.
- **Detalle técnico — XAdES-T con `xadesjs`:** la librería (`xadesjs`) documenta que solo XAdES-BES está
  "totalmente soportado"; no tiene un helper de alto nivel para adjuntar el
  `xades:UnsignedSignatureProperties/xades:SignatureTimeStamp` que define XAdES-T. Se implementó a mano
  pero usando la propia API tipada de la librería (no manipulación de DOM cruda): tras firmar (XAdES-BES,
  obteniendo `ds:SignatureValue`), se sella ese valor con la TSA, se agrega un
  `xades:EncapsulatedTimeStamp` a `signedXml.UnsignedProperties.UnsignedSignatureProperties`, y **recién
  ahí** se llama una única vez a `signature.GetXml()` para fijar el XML final (una segunda llamada
  posterior no vuelve a insertarlo). Verificado con tests: la firma sigue validando con el sello embebido,
  y la alteración de cualquier nodo referenciado (incluida una referencia a un evento anterior, para el
  encadenamiento de I7) hace fallar la verificación.
- **`node-forge` en `xml-engine`:** se agregó como devDependency **solo para tests**
  (`xades/test-cert.ts`, excluido del build vía `tsconfig.json`), porque `xadesjs` valida el DER del
  certificado embebido (`pkijs`) y un buffer arbitrario no sirve. La generación real de certificados para
  el simulador (CA efímera) vive en `packages/crypto-providers`, no acá.

## ADR-012 — Bug real en `pkijs` al verificar `SignedData` de un TSTInfo (RFC 3161)

- **Fecha:** 2026-07-22
- **Fase:** F5
- **Contexto:** al construir `TsaSimulador` (token RFC 3161 con `pkijs`: `TSTInfo` → `SignedData` →
  `ContentInfo`), se intentó usar el método de conveniencia `SignedData.verify()` de `pkijs` para
  confirmar que el token generado era válido. Falló con `"Error during verification: TSTInfo wrong
  ASN.1 schema"` de forma consistente. Se leyó el propio código fuente de `pkijs` (paquete instalado,
  `pkijs@3.4.0`) y se confirmó el bug: tras un round-trip de DER, `EncapsulatedContentInfo.eContent`
  queda envuelto en un tag `[0] EXPLICIT` (constructed, con un único hijo = el `OCTET STRING` real), pero
  la rama de detección de TSTInfo dentro de `verify()` llama a
  `TSTInfo.fromBER(this.encapContentInfo.eContent.valueBlock.valueHexView)` directamente sobre ese
  envoltorio sin desenvolverlo primero — el parseo del TSTInfo real nunca llega a ejecutarse con datos
  válidos.
- **Decisión:** no usar `SignedData.verify()` de `pkijs` para tokens TSTInfo. `leerTokenTsa()`
  (`packages/crypto-providers/src/simulador/tsa.simulador.ts`) desenvuelve manualmente
  `eContent.valueBlock.value[0].valueBlock.valueHexView` antes de llamar a `TSTInfo.fromBER`, y valida el
  token a nivel de campos (parsea `genTime`, `policy`, `hashedMessage` y el certificado firmante — el DoD
  de F5 exige que el token "parsee como RFC3161", no que pase por el `.verify()` de una librería con este
  bug puntual). Cubierto por test (`simulador.spec.ts` — "sella un hash y el token resultante parsea como
  RFC 3161").
- **Alternativas descartadas:** cambiar de librería (asn1.js/otro RFC3161 toolkit) — cambio de mayor
  alcance para un bug acotado a un solo método de conveniencia que no se usa en el resto de la app;
  parchear `pkijs` (fragiliza ante actualizaciones de la dependencia).

## ADR-013 — `node-forge` corrompe el DER de un `commonName` con caracteres no-ASCII si no se fuerza UTF8String

- **Fecha:** 2026-07-22
- **Fase:** F5
- **Contexto:** el plan (sección 6.3) especifica el nombre literal de la CA/TSA simuladas con un em-dash y
  vocal acentuada: `"AC SIMULADA PSDTE — NO VÁLIDA LEGALMENTE"`. Al generar la CA con `node-forge`
  (`generarAutoridadSimulada`) y luego intentar releer el propio certificado recién generado
  (`forge.pki.certificateFromPem(...)`), el parseo fallaba de forma determinística con `"Too few bytes to
  parse DER"` — reproducido también fuera de Jest (script `ts-node` aislado), descartando una causa de
  entorno de test. Inspeccionando el DER decodificado se vio la codificación corrupta exactamente en el
  tramo del em-dash/Á. Se confirmó la causa leyendo el código fuente de `node-forge` (`x509.js`,
  `_dnToAsn1`): el tipo ASN.1 por defecto para el valor de un atributo del subject/issuer es
  `PrintableString` (que no admite estos caracteres) **salvo** que el objeto de campo incluya
  `valueTagClass`, en cuyo caso, si es `UTF8`, la librería sí codifica el valor como UTF8String
  (`forge.util.encodeUtf8`) antes de serializarlo — sin ese flag, el string se serializa igual pero con un
  tag/longitud que no corresponde a su contenido real en UTF-8, corrompiendo el resto del `TBSCertificate`.
- **Decisión:** en `crearNombre()` (`packages/crypto-providers/src/simulador/ca.ts`), el atributo
  `commonName` se construye con `valueTagClass: forge.asn1.Type.UTF8` explícito, preservando el texto
  exacto del plan (em-dash y acentos incluidos) en vez de sustituirlo por una variante solo-ASCII. Los
  tipos de `@types/node-forge` no declaran `valueTagClass` en `CertificateField`, así que se castea
  puntualmente (`as unknown as forge.pki.CertificateField`) — es un campo real soportado en runtime, solo
  ausente de las declaraciones de tipos.
- **Alternativas descartadas:** cambiar `NOMBRE_CA`/`NOMBRE_TSA` a texto solo-ASCII (más simple, pero se
  aparta del texto literal que especifica el plan sin necesidad, dado que el fix real es acotado).

## ADR-014 — XML de referencia firmado recibido: cierre de F4 (builder/validator/XSD/parser)

- **Fecha:** 2026-07-22
- **Fase:** F4 (cierre) / F5 ya cerrada
- **Contexto:** ADR-001 dejó F4 bloqueada por el XML de referencia firmado del pagaré. El usuario lo
  subió (`firma_pagare_psdte_NO_TOCAR.xml`, copiado verbatim a
  `packages/xml-engine/test/fixtures/pagare-referencia-firmado.xml`, MD5 verificado). Un intento previo
  había sido, de nuevo, el "Diploma Digital" brasileño no relacionado (ver ADR-001) — se descartó sin usar
  antes de recibir el archivo correcto.
- **Estructura real observada** (namespace `http://acraiz.gov.py/pagare/arhivos-en-xsd`, 9 `ds:Signature`,
  4 `gEvento`):
  - IDs `vDTE.../dDTE.../eDTE...` comparten el mismo sufijo correlativo, confirmando el diseño de
    `IdDteService` (sección 5.3) ya implementado en el DDL (comentarios de `db/modelo_datos_psdte.sql`
    ya anticipaban exactamente esta forma).
  - Firmas anidadas, NO en la raíz del documento: 3 dentro de `gDatosGeneralesDTE` (Deudor, CoDeudor,
    sello PSDTE — todas referencian solo `#dDTE...`), 2 dentro de cada `gEvento` de ENDOSO (parte +
    sello PSDTE, ambas referenciando el evento propio Y el nodo anterior — `#dDTE...` para el primer
    evento, `#eDTE...-NNN` anterior para los siguientes — I7 confirmado empíricamente), 1 dentro del
    `gEvento` de PAGO (solo sello PSDTE), 0 dentro del `gEvento` de CANCELACION, y una firma final
    (`URI=""`, todo el documento) como hermana de `<DTE>` bajo `<rDTE>`.
  - Inconsistencias reales del propio XML de referencia (a tolerar al leer, nunca al generar):
    `numeroEvento` no es secuencial (se repite "001" en varios eventos — la secuencia real es el sufijo
    del atributo `ID`); `TextoPromesaPago`/`TextoEndoso` quedan con placeholders `[Clave]` sin resolver;
    asimetría en el sufijo "país" (`codigoPaisEmision`/`dPaisAcreedor` sin "DTE", pero
    `codigoPaisPagoDTE` sí lo lleva) entre bloques de dirección que por lo demás comparten el mismo
    patrón de sufijo.
- **Decisión:** se completó F4 con builder/validator/parser/XSD reales contra esta estructura exacta (no
  inferida por convención): `packages/xml-engine/src/{modelo,builder,parser,validator,monto-letras}` +
  `schema/pagare-dte.provisional.xsd`. El generador (`builder`) es estricto (revienta si un
  placeholder queda sin resolver); el parser es tolerante (reporta esas mismas inconsistencias como
  `avisos`, nunca lanza) — exactamente la asimetría que pide la sección 7 del plan. Test de integración
  (`builder/firma-integracion.spec.ts`) reproduce el patrón completo de firmas anidadas + encadenamiento
  I7 sobre un documento propio, y `parser/parser.spec.ts` lee el XML de referencia real completo (9
  firmas, 4 eventos) reportando sus inconsistencias como avisos.
- **Persona jurídica y `BLOQUEO` quedan fuera de alcance de este modelo**: ninguno está demostrado en el
  XML de referencia; se documentan como "puntos a confirmar" en el propio XSD en vez de inventarse.
  `BLOQUEO` se modela en F7 cuando haga falta, informado por lo que esa fase revele.

## ADR-015 — `xades` extendido para firmar un nodo anidado específico (no solo la raíz del documento)

- **Fecha:** 2026-07-22
- **Fase:** F4 (descubierto al construir el builder contra la estructura real del ADR-014)
- **Contexto:** `firmarNodoXadesBes`/`completarConSelloTiempo` (F4 original) solo soportaban firmar el
  documento completo de forma "enveloped" y adjuntar el resultado a `documento.documentElement` (la
  raíz). Los tests de F4/F5 no lo notaron porque siempre firmaban documentos de una sola pieza donde el
  nodo firmado ERA la raíz. El perfil real (ADR-014) necesita apilar hasta 3 firmas dentro de
  `gDatosGeneralesDTE` y hasta 2 dentro de cada `gEvento` — nodos anidados, no la raíz.
- **Decisión:** se agregaron dos parámetros opcionales, retrocompatibles (default = comportamiento
  anterior): `uriNodoPrincipal` en `OpcionesFirmarXades` (URI de la referencia principal, antes
  implícitamente `''` = todo el documento) y `nodoDestino` en `completarConSelloTiempo` (elemento donde
  se inserta el `ds:Signature`, antes implícitamente la raíz). Verificado con un test nuevo
  (`xades.spec.ts` — "apila varias firmas dentro de un nodo anidado") que 3 firmas apiladas en el mismo
  nodo, cada una añadida después de la anterior, validan todas de forma independiente y que alterar el
  contenido invalida las 3 — antes de escribir el builder completo, para no descubrir un problema de
  arquitectura a mitad de una pieza mucho más grande.
- **Alternativas descartadas:** firmar cada fragmento en un documento temporal aparte y trasplantar el
  nodo firmado al documento final — más complejo (nodos cruzando de dueño de documento) para un beneficio
  nulo, dado que xadesjs sí soporta referenciar un nodo interno directamente.

## ADR-016 — Bug real: `RegExp` con bandera global reutilizado entre `.test()` pierde coincidencias

- **Fecha:** 2026-07-22
- **Fase:** F4
- **Contexto:** el parser tolerante (`parser/index.ts`) usaba un único `RegExp` a nivel de módulo con la
  bandera `g` para detectar placeholders `[Clave]` sin resolver, llamando a `.test()` varias veces (una
  por texto libre: `TextoPromesaPago`, cada `TextoEndoso`). El test contra el XML de referencia real
  esperaba 3 avisos `PLACEHOLDER_SIN_RESOLVER` y solo se reportaron 2 — intermitente según el orden de
  llamadas. Causa: con la bandera `g`, `RegExp.prototype.test` mantiene `lastIndex` entre llamadas sobre
  el mismo objeto, así que la búsqueda siguiente arranca donde terminó la anterior en vez de desde el
  principio del string, produciendo falsos negativos cuando el placeholder aparece antes de esa posición.
- **Decisión:** se quitó la bandera `g` del patrón (`PATRON_PLACEHOLDER`), ya que solo se usa para un
  chequeo booleano (`.test()`), no para iterar coincidencias con `.exec()`/`.matchAll()`. Regla general
  documentada en el propio código: nunca reusar un `RegExp` con estado (`g`/`y`) entre llamadas a
  `.test()`/`.exec()` a menos que se resetee `lastIndex` explícitamente o se cree una instancia nueva.
- **Alternativas descartadas:** resetear `lastIndex = 0` antes de cada `.test()` (funciona, pero es más
  fácil de volver a romper por accidente que simplemente no usar `g` donde no hace falta).

## ADR-017 — XSD provisional sin `xs:import` a un esquema remoto (xmldsig-core)

- **Fecha:** 2026-07-22
- **Fase:** F4
- **Contexto:** un primer borrador de `pagare-dte.provisional.xsd` importaba el XSD oficial de
  `ds:Signature` vía `xs:import namespace="...xmldsig#" schemaLocation="http://www.w3.org/TR/.../xmldsig-core-schema.xsd"`.
  Esto viola la restricción del plan (sección 0.2: "sin acceso a internet garantizado en runtime") —
  `libxmljs2` intentaría resolver esa URL al compilar el esquema, rompiendo en cualquier entorno sin red
  (CI, producción con egress restringido).
- **Decisión:** dondequiera que el perfil admite un `ds:Signature` (dentro de `gDatosGeneralesDTE`, cada
  `gEvento`, y el sello final bajo `rDTE`), el XSD usa
  `<xs:any namespace="http://www.w3.org/2000/09/xmldsig#" processContents="skip"/>` en vez de tipar el
  elemento. Es además más correcto conceptualmente: la validez de una firma (criptográfica, XAdES) la
  determina `xades`/`validator`, no la validación estructural XSD — el XSD solo necesita saber que "ahí
  puede haber cero o más nodos de firma", no validar su contenido interno.
- **Alternativas descartadas:** vendorizar una copia local del XSD oficial de xmldsig-core (viable, pero
  agrega un archivo de terceros a mantener por un beneficio que `xs:any` ya cubre sin esa carga).
