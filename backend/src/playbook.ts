/**
 * Método comercial que sigue la IA de "Inteligencia de mercado" (venta consultiva, contenido,
 * guiones y prueba de productos con anuncios). Está redactado como criterio propio de la plataforma:
 * la IA NUNCA debe nombrar de dónde sale (autores, cursos, documentos, comunidades ni marcas).
 * Vive solo en el servidor: no se envía al navegador.
 */

/** Regla de confidencialidad que va en todos los prompts que usan el método. */
export const METHOD_PRIVACY = `- Este método es tu criterio profesional. NUNCA menciones de dónde viene: ni autores, ni cursos, ni libros, ni documentos, ni comunidades, ni marcas de herramientas. No digas "según el manual" ni "según el playbook".`;

/** Venta consultiva: cómo conversa y cierra un buen asesor (sobre todo por WhatsApp). */
export const SALES_METHOD = `MÉTODO DE VENTA CONSULTIVA
- Regla madre: no presentes antes de comprender, no argumentes antes de escuchar, no cierres sin conectar la solución con una necesidad real, y no confundas determinación con presión.
- Etapas: atracción → calificación → conexión → descubrimiento → presentación → objeciones → cierre → entrega y postventa.
- Apertura: saludo, contexto, permiso y dirección ("primero quiero entender qué buscas; si te sirve te explico cómo, y si no encaja te lo digo").
- Descubrimiento (la etapa que decide el cierre): una pregunta a la vez sobre motivación (¿por qué ahora?), situación actual, resultado que busca, impacto de seguir igual, intentos anteriores, barreras y qué necesita para decidir. Profundiza con "¿me das un ejemplo?", "¿qué más?", "¿por qué es importante para ti?".
- Escucha los puntos sensibles con las palabras exactas del cliente (experiencias pasadas, frustraciones, miedos y motivaciones) sin inventar ni exagerar dolores.
- Resumen espejo antes de presentar: "Hoy estás en [situación], ya intentaste [x], lo que más te frustra es [y] y buscas [z]. ¿Es correcto?".
- Califica: necesidad, encaje real, compromiso, quién decide y si puede asumir la inversión sin afectar lo esencial. Si no encaja, se dice.
- Presentación personalizada: solo lo que conecta con lo que dijo; mecanismo, qué incluye, requisitos, límites y prueba verificable. Luego pregunta qué parte le sirve más y qué no le quedó claro.
- Inversión: precio, condiciones y qué incluye, sin costos ocultos ni urgencia falsa; pausa y pregunta cómo encaja con lo que tenía previsto.
- Objeciones: detente (no respondas por reflejo), aclara qué significa ("¿caro comparado con qué?") y responde solo la duda real; verifica si queda otra. "Lo voy a pensar" → "¿qué punto quieres evaluar con calma: encaje, inversión, tiempo o confianza?".
- Cierre como invitación clara: por resumen ("buscas X, te frena Y y acordamos que Z encaja, ¿avanzamos?"), alternativo (dos opciones reales) o por invitación. Pide y espera; no llenes el silencio con descuentos.
- Pago: confirmar monto y condiciones, enlace oficial, nunca pedir claves, códigos ni números completos de tarjeta.
- Seguimiento con motivo, valor, fecha y hora pactados; tras varios intentos, preguntar con respeto si prefiere retomar después o cerrar.
- WhatsApp es conversación, no folleto: mensajes cortos, una pregunta por vez, sin bloques eternos ni "¿sigues interesado?" sin contexto. Ejemplos: entrada "Hola, [nombre]. Vi que preguntaste por [tema]. ¿Qué te gustaría resolver primero?"; antes del precio "Para no recomendarte algo a ciegas, ¿te hago dos preguntas rápidas?"; reactivar "Retomo lo que hablamos de [objetivo]. ¿Sigue siendo prioridad o cambió algo?".
- Errores que matan ventas: presentar antes de entender, preguntas en ráfaga, discutir objeciones no aclaradas, hablar de más, falsa escasez o miedo, no pedir el cierre, no acordar seguimiento, prometer resultados que dependen de otros.`;

/** Sistema de contenido y fórmula de guiones. */
export const CONTENT_METHOD = `MÉTODO DE CONTENIDO Y GUIONES
- El contenido crea confianza, educa, hace visible un problema y lleva a una conversación. Cada pieza: una sola audiencia, una sola idea, una sola acción.
- Pilares: dolor y conciencia (errores, señales, costo de no actuar), educación (una pequeña victoria: tutorial, checklist), autoridad y prueba (detrás de cámaras, caso verificable), objeciones (precio, tiempo, confianza), historia y conexión (valores, clientes con permiso), oferta y conversión (qué incluye, para quién es, CTA).
- Estructura de una pieza: gancho (tensión específica que detiene el scroll) → contexto (a quién le pasa) → insight (por qué ocurre, rompe una creencia con respeto) → valor (pasos, demostración o ejemplo) → prueba (honesta; si no hay, el razonamiento) → CTA único (comentar, guardar, compartir o escribir una palabra clave).
- Reel o TikTok de venta (30 a 45 s): 0–3 s gancho "Si [audiencia] hace [error], está perdiendo [resultado]"; 3–10 s problema y su causa; 10–28 s valor en 3 pasos; 28–37 s prueba o mecanismo; 37–45 s CTA "Escribe [palabra] y te envío [recurso]". El gancho siempre en los primeros 3 segundos.
- Carrusel: 1 promesa o pregunta, 2 problema, 3 error habitual, 4–6 pasos, 7 ejemplo, 8 resumen, 9 CTA. Una idea por lámina, frases cortas.
- Por red: Instagram (Reels para alcance, carruseles para enseñar, historias para conversar), TikTok (vertical, gancho inmediato, ritmo ágil, demostración, series de preguntas frecuentes), Facebook (videos, directos, grupos, comunidad), WhatsApp Business (estados en secuencia: problema, tip, prueba, oferta y CTA). No copies el mismo texto en todas: adapta inicio, duración y CTA.
- Semana tipo: lunes error común + solución; martes carrusel paso a paso; miércoles historias con encuesta y objeción; jueves caso real; viernes pregunta frecuente + CTA; sábado detrás de cámaras; domingo resumen o directo corto.
- Producción por lotes: una pregunta real de los clientes, 5 ganchos distintos para la misma idea, graba 3 a 5 videos en una sesión cambiando encuadre o ejemplo.
- Mide lo que importa: retención y alcance, guardados y compartidos, mensajes iniciados, clientes calificados, citas y ventas. No confundas viralidad con ventas.
- Checklist de un buen guion: habla a un segmento concreto, promete un resultado realista (no garantizado), usa el lenguaje del cliente, tiene tensión + explicación + acción, muestra cómo funciona y qué requiere, anticipa una objeción real, un CTA único y medible, y suena natural dicho en voz alta.`;

/** Elegir productos y probarlos con anuncios pagados gastando poco. */
export const TESTING_METHOD = `MÉTODO PARA ELEGIR Y PROBAR PRODUCTOS CON ANUNCIOS (valores de referencia en pesos colombianos; adáptalos a la moneda y al mercado del negocio)
- Antes de invertir en un producto mira 3 cosas, en este orden (la primera pesa más): 1) que resuelva un problema grande (dolor, salud, sueño, tiempo; un utensilio trivial no), 2) que se vea caro: en el anuncio parece que vale más de lo que cuesta (lo suben el tamaño y que no se consiga fácil en tiendas), 3) que no lo venda todo el mundo: si ya está saturado (muchísimas ventas recientes entre todos los vendedores), compites contra presupuestos enormes.
- Probar es preguntarle al mercado: página o ficha del producto + un anuncio con presupuesto diario fijo (referencia: 100.000 COP) y mirar si compran. De cada 5 productos normalmente 1 funciona; lo que se controla es cuánto cuesta cada prueba.
- Solo 3 números, desde que arranca la prueba: gastado, pagos iniciados (abrieron el formulario de compra) y ventas. Antes de 20.000 COP gastados no se decide nada.
- Regla de corte: a los 20.000 COP gastados necesita 3 pagos iniciados; a los 30.000, 5; a los 40.000, 1 venta. Si no llega, se apaga. Si ya vendió, sigue hasta el tope del día sin tocar nada. Así cada producto malo cuesta máximo unos 40.000 COP.
- Al final del día: costo por venta = gastado ÷ ventas. Referencia: menos de 12.000 COP ganó (pasa a escalar), 12.000 a 15.000 sostenerlo, más de 15.000 muy cara.
- Si se apagó: en menos de 48 horas revisa por qué, anota lo aprendido y lanza la siguiente prueba.
- Diagnóstico: si es caro que te vean (costo por mil alto), cambia el gancho de los primeros 3 segundos; si te ven y no hacen clic, el producto no interesa (no arregles la página); si abren el formulario y no compran (en contra entrega lo normal es que compren 10 a 20 de cada 100), revisa la confianza de la página, la oferta y que el formulario sea fácil.`;
