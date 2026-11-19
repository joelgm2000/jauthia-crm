// PDF de prueba con la misma distribución del formulario RUT de la DIAN (texto real dentro del PDF, como el que se descarga).
// Uso: import { rutPdf } from './rut-pdf.mjs'; const bytes = await rutPdf();
import { PDFDocument, StandardFonts } from 'pdf-lib';

const ROWS = [
  [40, [[180, 'Formulario del Registro Único Tributario']]],
  [100, [[20, '5. Número de Identificación Tributaria (NIT)'], [300, '6. DV'], [330, '12. Dirección seccional']]],
  [112, [[60, '1 0 0 1 9 9 4 2 0 1'], [305, '3'], [335, 'Impuestos y Aduanas de Valledupar']]],
  [140, [[20, '24. Tipo de contribuyente'], [200, '25. Tipo de documento'], [330, '26. Número de Identificación']]],
  [152, [[20, 'Persona natural o sucesión ilíquida 2'], [200, 'Cédula de Ciudadanía 1 3'], [360, '1 0 0 1 9 9 4 2 0 1']]],
  [190, [[20, '31. Primer apellido'], [160, '32. Segundo apellido'], [300, '33. Primer nombre'], [440, '34. Otros nombres']]],
  [202, [[20, 'MENDEZ'], [160, 'ALCOCER'], [300, 'JAVIER'], [440, 'ENRIQUE']]],
  [230, [[20, '35. Razón social']]],
  [260, [[20, '36. Nombre comercial'], [350, '37. Sigla']]],
  [272, [[20, 'EVOSPORT']]],
  [300, [[20, '38. País'], [200, '39. Departamento'], [400, '40. Ciudad/Municipio']]],
  [312, [[20, 'COLOMBIA 1 6 9'], [200, 'Cesar 2 0'], [400, 'Valledupar 0 0 1']]],
  [340, [[20, '41. Dirección principal']]],
  [352, [[20, 'CR 9 9B 15 LC 1']]],
  [370, [[20, '42. Correo electrónico']]],
  [382, [[20, 'ing.javier19@gmail.com']]],
  [400, [[20, '43. Código postal'], [200, '44. Teléfono 1'], [400, '45. Teléfono 2']]],
  [412, [[230, '3 0 0 3 9 4 8 1 9 0']]],
  [450, [[20, '46. Código'], [100, '47. Fecha inicio actividad'], [300, '48. Código']]],
  [462, [[20, '4 7 6 2'], [100, '2 0 2 2 0 9 1 4'], [300, '5 6 1 1']]],
];

export async function rutPdf({ empresa = false } = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [y, cells] of ROWS) {
    for (const [x, text] of cells) {
      let t = text;
      if (empresa && y === 152 && x === 20) t = 'Persona jurídica 1';
      if (empresa && y === 202) continue;
      page.drawText(t.replace(/[^\x00-\xFF]/g, '?'), { x, y: 792 - y - 8, size: 8, font });
    }
    if (empresa && y === 230) page.drawText('DEPORTES DEL CESAR S.A.S.', { x: 20, y: 792 - 242 - 8, size: 8, font });
  }
  return Buffer.from(await doc.save());
}

/** PDF escaneado (sin texto): solo una línea, como si fuera una imagen. */
export async function scannedPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}
