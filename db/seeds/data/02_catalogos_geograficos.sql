-- Catálogos geográficos y de identidad mínimos (ver db/modelo_datos_psdte.sql sección 16).
-- NOTA: el XML de ejemplo usa inconsistentemente 600 y 1 para Paraguay (no corregir, ver plan
-- sección "Visión del producto"). Los códigos de departamento/distrito/ciudad de Asunción son
-- provisionales (DECISIONES.md ADR-003) hasta contar con el catálogo geográfico oficial DGEEC.

INSERT INTO psdte.cat_pais (codigo, nombre) VALUES (600, 'Paraguay'), (1, 'Paraguay')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_moneda (codigo, descripcion) VALUES
    ('PYG','Guaraníes'), ('USD','Dólares americanos')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_tipo_documento_identidad (codigo, sigla, descripcion) VALUES
    (1,'CI','Cédula de Identidad'),
    (2,'RUC','Registro Único de Contribuyente'),
    (3,'PAS','Pasaporte')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_departamento (codigo, nombre, pais_codigo) VALUES
    (0, 'Capital', 600)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_distrito (codigo, nombre, departamento_codigo) VALUES
    (1, 'Asunción', 0)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_ciudad (codigo, nombre, distrito_codigo) VALUES
    (1, 'Asunción', 1)
ON CONFLICT (codigo) DO NOTHING;
