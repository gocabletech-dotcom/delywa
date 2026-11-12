// Sustituto de "cloudflare:workers" para las pruebas en Node (allí no existe ese módulo).
export class DurableObject<E = unknown> {
  constructor(protected ctx: DurableObjectState, protected env: E) {}
}
