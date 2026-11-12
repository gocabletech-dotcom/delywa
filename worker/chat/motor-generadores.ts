// Generación con IA para el panel de plataforma: plantilla de menú por tipo de
// negocio y jerga por tipo de negocio o por país. Código del servidor original
// (server/routes.ts) trasladado casi literal; el puente está en chat/adaptador.ts.
/* eslint-disable */
import { storage, openai, type AppLike } from "./adaptador";

// La sesión y el rol de administrador se comprueban en routes/generadores.ts antes de llegar aquí.
const isAuthenticatedCustom = null;
const isAdmin = null;

export function registrarGeneradores(app: AppLike): void {
  app.post("/api/admin/plantillas/generar", isAuthenticatedCustom, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.session?.userId;
      const user = await storage.getUserById(userId);
      
      if (!user || user.role !== "platform_admin") {
        return res.status(403).json({ error: "Solo administradores pueden generar plantillas" });
      }
      
      const { tipoNegocio, nombreTipo, descripcion } = req.body;
      
      if (!tipoNegocio || !nombreTipo) {
        return res.status(400).json({ error: "Tipo de negocio requerido" });
      }
      
      // Check if template already exists
      const existingPlantillas = await storage.getPlantillasByTipoNegocio(tipoNegocio);
      if (existingPlantillas.length > 0) {
        return res.status(400).json({ error: "Ya existe una plantilla para este tipo de negocio" });
      }
      
      // Generate template with AI
      const prompt = `Genera una plantilla de menú para un negocio de tipo "${nombreTipo}" en República Dominicana.
${descripcion ? `Descripción del negocio: ${descripcion}` : ""}

Debes generar entre 4 y 6 categorías con 5-8 productos cada una. Los precios deben ser realistas para el mercado local.

Responde SOLO con un JSON válido con esta estructura exacta:
{
  "categorias": [
    {
      "nombre": "Nombre de la Categoría",
      "orden": 1,
      "productos": [
        { "nombre": "Nombre del Producto", "precioSugerido": "150", "orden": 1 },
        { "nombre": "Otro Producto", "precioSugerido": "200", "orden": 2 }
      ]
    }
  ]
}

No incluyas explicaciones, solo el JSON.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
      
      const responseText = completion.choices[0]?.message?.content || "";
      
      // Parse JSON from response
      let plantillaData;
      try {
        // Try to extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          plantillaData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        console.error("Error parsing AI response:", responseText);
        return res.status(500).json({ error: "Error al procesar la respuesta de IA" });
      }
      
      // Validate AI response schema
      if (!plantillaData.categorias || !Array.isArray(plantillaData.categorias) || plantillaData.categorias.length === 0) {
        console.error("Invalid AI response structure:", plantillaData);
        return res.status(500).json({ error: "La IA no generó categorías válidas" });
      }
      
      // Validate each category has required fields
      for (const categoria of plantillaData.categorias) {
        if (!categoria.nombre || !Array.isArray(categoria.productos)) {
          console.error("Invalid category structure:", categoria);
          return res.status(500).json({ error: "La IA generó categorías con formato inválido" });
        }
      }
      
      // Save plantillas to database
      const createdPlantillas = await storage.crearPlantillasDesdeIA(tipoNegocio, plantillaData.categorias);
      
      res.json({ 
        success: true, 
        message: `Se crearon ${createdPlantillas.length} categorías para ${nombreTipo}`,
        plantillas: createdPlantillas 
      });
    } catch (error) {
      console.error("Error generating menu template:", error);
      res.status(500).json({ error: "Error al generar plantilla de menú" });
    }
  });

  app.post("/api/admin/jerga/generar-ia", isAuthenticatedCustom, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.session?.userId;
      const user = await storage.getUserById(userId);
      
      if (!user || user.role !== "platform_admin") {
        return res.status(403).json({ error: "Solo administradores pueden generar jerga" });
      }
      
      const { tipoNegocio } = req.body;
      
      if (!tipoNegocio) {
        return res.status(400).json({ error: "tipoNegocio es requerido" });
      }
      
      // Get nombreTipo from catalog
      const tiposCatalogo = await storage.getTiposNegocio();
      const tipoInfo = tiposCatalogo.find(t => t.slug === tipoNegocio);
      const nombreTipo = tipoInfo?.nombre || tipoNegocio;
      const descripcionTipo = tipoInfo?.descripcion || "";
      
      // Ejemplos específicos según tipo de negocio
      const ejemplosPorTipo: Record<string, string> = {
        "colmado": `- "carnation" = leche evaporada Carnation
- "ponchera" = aguacate grande
- "chin" = un poco de algo
- "chimi" = chimichurri (sandwich)
- "pica pollo" = pollo frito
- "yaroa" = yaroa (comida callejera)
- "la bandera" = arroz, habichuelas y carne`,
        "pica_pollo": `- "combo" = combo de pollo con papas y refresco
- "muslo" = pieza de muslo de pollo
- "pechuga" = pieza de pechuga de pollo
- "alita" = ala de pollo frita
- "papitas" = papas fritas
- "crujiente" = pollo extra crujiente
- "familiar" = combo grande para familia
- "3 piezas" = combo de 3 piezas de pollo`,
        "pizzeria": `- "grande" = pizza tamaño grande
- "personal" = pizza tamaño personal
- "pepperoni" = pizza de pepperoni
- "hawaiana" = pizza con jamón y piña
- "suprema" = pizza con todo
- "con extra queso" = pizza con queso adicional
- "porción" = una rebanada de pizza`,
        "cafeteria": `- "negrito" = café negro pequeño
- "con leche" = café con leche
- "cortadito" = café con un poco de leche
- "capuchino" = cappuccino
- "frape" = frappé de café
- "morir soñando" = jugo de naranja con leche`,
        "farmacia": `- "para el dolor de cabeza" = paracetamol o ibuprofeno
- "para la gripe" = antigripal
- "curitas" = venditas adhesivas
- "sal de uva" = sal de fruta o antiácido
- "vitaminas" = multivitamínicos`,
        "restaurant": `- "bandera" = arroz, habichuelas y carne (comida típica)
- "moro" = arroz moro de habichuelas
- "tostones" = plátano verde frito
- "chivo" = carne de chivo guisada
- "morir soñando" = jugo de naranja con leche`,
        "fast_food": `- "combo" = hamburguesa con papas y refresco
- "doble" = hamburguesa doble carne
- "con queso" = hamburguesa con queso
- "papitas" = papas fritas
- "nuggets" = nuggets de pollo`
      };
      
      const ejemplos = ejemplosPorTipo[tipoNegocio] || ejemplosPorTipo["colmado"];
      
      const prompt = `Eres un experto en el lenguaje coloquial dominicano y en negocios de tipo "${nombreTipo}" (${descripcionTipo}).

Genera una lista de jerga, expresiones y formas coloquiales que los clientes dominicanos usan ESPECÍFICAMENTE para pedir productos en un negocio tipo "${nombreTipo}".

Ejemplos de jerga para este tipo de negocio:
${ejemplos}

IMPORTANTE: Genera SOLO expresiones relacionadas con productos y servicios de un "${nombreTipo}". 
- Para pica pollo: expresiones sobre pollo frito, combos, piezas, acompañantes, etc.
- Para pizzería: expresiones sobre pizzas, tamaños, sabores, etc.
- Para colmado: expresiones sobre bebidas, abarrotes, productos básicos, etc.

Genera al menos 20-25 expresiones de jerga típicas dominicanas para "${nombreTipo}". Incluye:
- Nombres coloquiales de productos específicos de este negocio
- Formas de pedir tamaños o cantidades
- Marcas que se usan como genérico
- Expresiones locales para combos o promociones
- Formas de pedir preparaciones especiales

RESPONDE EN JSON con este formato exacto:
{
  "jergas": [
    { "jerga": "expresión", "producto": "producto identificado", "precio": null, "descripcion": "explicación breve" }
  ]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1500,
      });

      let jergaData: any = {};
      try {
        jergaData = JSON.parse(completion.choices[0]?.message?.content || "{}");
      } catch (parseError) {
        return res.status(500).json({ error: "Error al procesar respuesta de IA" });
      }

      if (!jergaData.jergas || !Array.isArray(jergaData.jergas)) {
        return res.status(500).json({ error: "Formato de respuesta inválido" });
      }

      // Save jergas to database
      const createdJergas = [];
      for (const item of jergaData.jergas) {
        if (item.jerga && item.producto) {
          try {
            const nueva = await storage.createPlantillaJerga({
              tipoNegocio,
              jerga: item.jerga.toLowerCase().trim(),
              productoIdentificado: item.producto,
              precioSugerido: item.precio?.toString() || null,
              descripcion: item.descripcion || null,
              activo: true,
            });
            createdJergas.push(nueva);
          } catch (e) {
            console.log(`Skipping duplicate jerga: ${item.jerga}`);
          }
        }
      }

      res.json({ 
        success: true, 
        message: `Se crearon ${createdJergas.length} expresiones de jerga para ${nombreTipo}`,
        jergas: createdJergas 
      });
    } catch (error) {
      console.error("Error generating jerga:", error);
      res.status(500).json({ error: "Error al generar jerga con IA" });
    }
  });

  app.post("/api/admin/paises/:id/generar-jerga", isAuthenticatedCustom, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

      const pais = await storage.getPais(id);
      if (!pais) return res.status(404).json({ error: "País no encontrado" });

      // Build culturally-aware prompt for the country
      const prompt = `Eres un experto en lenguaje coloquial y cultura de ${pais.nombre}.

Genera exactamente 30 entradas de jerga o términos coloquiales que usan las personas de ${pais.nombre} cuando piden productos en tiendas de barrio, almacenes, kioskos, farmacias, pizzerías y servicios de delivery por WhatsApp.

Incluye:
- Nombres informales de productos alimenticios comunes
- Términos coloquiales para bebidas
- Expresiones para pedir cantidades
- Nombres locales de platos típicos o comidas callejeras
- Palabras de uso cotidiano al ordenar por delivery

Contexto cultural: ${pais.nombre}, moneda ${pais.moneda} (${pais.simboloMoneda}), zona horaria ${pais.zonaHoraria}.

Responde ÚNICAMENTE con un JSON object con esta estructura exacta:
{
  "entradas": [
    {
      "jerga": "término coloquial o nombre informal",
      "productoIdentificado": "producto o concepto que representa",
      "tipoNegocio": "colmado",
      "descripcion": "breve explicación del uso en ${pais.nombre}"
    }
  ]
}

Varía el campo "tipoNegocio" usando estas opciones según corresponda: colmado, cafeteria, restaurant, fast_food, farmacia, pizzeria, colmadon.
No incluyas comentarios ni texto fuera del JSON.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content || "{}";
      let entries: Array<{ jerga: string; productoIdentificado: string; tipoNegocio: string; descripcion?: string }> = [];

      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.entradas)) {
          entries = parsed.entradas;
        } else {
          // Fallback: find first array property in case model uses a different key
          const arrProp = Object.values(parsed).find(v => Array.isArray(v));
          entries = (arrProp as any[]) || [];
        }
      } catch {
        return res.status(500).json({ error: "Error al parsear respuesta de IA" });
      }

      if (!entries.length) {
        return res.status(500).json({ error: "La IA no generó entradas de jerga válidas" });
      }

      // Insert entries into plantillas_jerga with the country's paisId
      const created: any[] = [];
      for (const entry of entries) {
        if (!entry.jerga || !entry.productoIdentificado) continue;
        try {
          const nueva = await storage.createPlantillaJerga({
            tipoNegocio: entry.tipoNegocio || "colmado",
            jerga: entry.jerga.toLowerCase().trim(),
            productoIdentificado: entry.productoIdentificado,
            descripcion: entry.descripcion || null,
            precioSugerido: null,
            activo: true,
            paisId: id,
          });
          created.push(nueva);
        } catch {
          // Skip duplicates silently
        }
      }

      res.json({ success: true, generadas: created.length, entradas: created });
    } catch (error) {
      console.error("Error generating pais jerga:", error);
      res.status(500).json({ error: "Error al generar jerga con IA" });
    }
  });
}
