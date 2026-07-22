-- Seeds CAT-DTE-01, 02, 03, 08, 10 (tomados de db/modelo_datos_psdte.sql sección 16, idempotentes).

INSERT INTO psdte.cat_estado_dte (codigo,nombre,descripcion,es_final,permite_endoso,permite_pago) VALUES
 (1,'EMITIDO','Pagaré emitido, firmado y registrado; tenedor = acreedor inicial',FALSE,TRUE,TRUE),
 (2,'ENDOSADO','Control transferido a nuevo tenedor por endoso',FALSE,TRUE,TRUE),
 (3,'PRESENTADO_AL_COBRO','Presentado al deudor para pago',FALSE,FALSE,TRUE),
 (4,'PAGADO_PARCIAL','Pago parcial registrado; saldo pendiente > 0',FALSE,TRUE,TRUE),
 (5,'PAGADO_TOTAL','Saldo cero; pendiente de cancelación formal',FALSE,FALSE,FALSE),
 (6,'PROTESTADO','Protesto por falta de pago registrado',FALSE,FALSE,TRUE),
 (7,'BLOQUEADO','Inmovilizado por medida cautelar u orden de autoridad',FALSE,FALSE,FALSE),
 (8,'CANCELADO','Cancelado/extinguido; conservación >= 10 años',TRUE,FALSE,FALSE),
 (9,'VENCIDO','Vencido sin pago total; habilita protesto/acciones',FALSE,FALSE,TRUE)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_tipo_evento (codigo,nombre,descripcion,requiere_firma_endosante,requiere_firma_endosatario) VALUES
 (1,'CANCELACION','Cancelación / extinción del DTE (observado en XML)',FALSE,FALSE),
 (2,'BLOQUEO','Bloqueo / medida cautelar (código a confirmar)',FALSE,FALSE),
 (3,'ENDOSO','Transferencia del control por endoso (observado en XML)',TRUE,TRUE),
 (4,'PAGO','Pago total o parcial (observado en XML)',FALSE,FALSE),
 (5,'PRESENTACION_COBRO','Presentación al cobro (código a confirmar)',FALSE,FALSE),
 (6,'PROTESTO','Protesto (código a confirmar)',FALSE,FALSE),
 (7,'LEVANTAMIENTO_BLOQUEO','Levantamiento de medida (código a confirmar)',FALSE,FALSE),
 (8,'ANOTACION_AUTORIDAD','Anotación ordenada por autoridad (código a confirmar)',FALSE,FALSE)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_transicion (estado_origen,tipo_evento,estado_destino,condicion) VALUES
 (1,3,2,NULL),
 (2,3,2,NULL),
 (1,4,4,'saldo > 0'),
 (1,4,5,'saldo = 0'),
 (2,4,4,'saldo > 0'),
 (2,4,5,'saldo = 0'),
 (4,4,4,'saldo > 0'),
 (4,4,5,'saldo = 0'),
 (4,3,2,NULL),
 (3,4,5,'saldo = 0'),
 (3,4,4,'saldo > 0'),
 (1,5,3,NULL), (2,5,3,NULL), (4,5,3,NULL), (9,5,3,NULL),
 (3,6,6,NULL), (9,6,6,NULL),
 (5,1,8,NULL),
 (1,2,7,NULL), (2,2,7,NULL), (3,2,7,NULL), (4,2,7,NULL), (6,2,7,NULL), (9,2,7,NULL),
 (7,7,2,'restaurar estado previo')
ON CONFLICT (estado_origen, tipo_evento, condicion) DO NOTHING;

INSERT INTO psdte.cat_nivel_consulta (codigo,nombre,campos_visibles,descripcion) VALUES
 (1,'PUBLICO','["existencia","estado","fecha_emision","hash_verificacion"]','Verificación por QR/URI sin autenticación'),
 (2,'INTERVINIENTE','["*_propios","eventos","tenedor","montos","saldo"]','Partes del DTE autenticadas'),
 (3,'AUTORIDAD','["*"]','Autoridad de Aplicación / orden judicial'),
 (4,'AUDITOR','["*","logs","evidencias"]','Auditoría interna / OEC')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_error (codigo,http_status,mensaje,categoria) VALUES
 ('ERR-XSD-001',422,'El XML no cumple el esquema XSD del perfil DTE','VALIDACION_XSD'),
 ('ERR-SEM-001',422,'Regla semántica violada: monto en letras no coincide','VALIDACION_SEMANTICA'),
 ('ERR-SEM-002',422,'Fecha de vencimiento anterior a la emisión','VALIDACION_SEMANTICA'),
 ('ERR-FIRMA-001',422,'Firma XAdES inválida o alterada','FIRMA'),
 ('ERR-FIRMA-002',422,'Certificado no cualificado o fuera de TSL','FIRMA'),
 ('ERR-FIRMA-003',422,'Certificado revocado (OCSP/CRL)','FIRMA'),
 ('ERR-FIRMA-004',422,'Sello de tiempo TSA ausente o inválido','TSA'),
 ('ERR-ESTADO-001',409,'Transición de estado no permitida','ESTADO'),
 ('ERR-ESTADO-002',409,'DTE cancelado: no admite nuevos eventos','ESTADO'),
 ('ERR-ESTADO-003',423,'DTE bloqueado por medida de autoridad','ESTADO'),
 ('ERR-CONC-001',409,'Conflicto de concurrencia: reintente la operación','CONCURRENCIA'),
 ('ERR-CTRL-001',403,'El solicitante no es el tenedor/controlador vigente','AUTORIZACION'),
 ('ERR-DTE-404',404,'DTE inexistente','VALIDACION_SEMANTICA'),
 ('ERR-DTE-409',409,'ID-DTE ya registrado: singularidad violada','VALIDACION_SEMANTICA'),
 ('ERR-SISTEMA-001',500,'Error interno del servidor','SISTEMA'),
 ('ERR-AUTH-001',401,'Credenciales inválidas','AUTORIZACION'),
 ('ERR-AUTH-002',401,'Sesión inválida, expirada o revocada','AUTORIZACION'),
 ('ERR-AUTH-003',403,'Código MFA inválido','AUTORIZACION'),
 ('ERR-AUTH-004',403,'MFA requerida y no verificada para este rol','AUTORIZACION'),
 ('ERR-AUTH-005',423,'Usuario bloqueado por intentos fallidos','AUTORIZACION'),
 ('ERR-PKI-503',503,'Servicio PCSC/TSL no disponible: degradación controlada','PKI')
ON CONFLICT (codigo) DO NOTHING;
