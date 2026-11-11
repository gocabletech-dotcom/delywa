# Prompt Regression Checklist — ZIP / Postal Code Validation

This checklist must be verified whenever the AI system prompt is edited for any of the three
ordering channels (Meta WhatsApp, Evolution API, or chat-web AI). A future prompt change that
removes or weakens the ZIP instruction will silently break delivery for businesses that require a
postal code.

---

## Channels covered

| Channel | Relevant code location (server/routes.ts) |
|---|---|
| Meta WhatsApp AI | `addressFormatContextMeta` (~line 5473) |
| Evolution API AI | `addressFormatContextEvol` (~line 11432) |
| Chat-web AI (text chat) | `addressFormatContext` (~line 8226) |

---

## What each prompt instructs the AI to do

When `requiereCodigoPostal = true` for the business's country, the injected prompt section
contains the following (paraphrased — check the actual string in `routes.ts`):

> **VALIDACIÓN ZIP OBLIGATORIA**: This business requires `<etiquetaCodigoPostal>` in every address.
> If the customer has already provided their address but it does NOT contain a postal code
> (a digit sequence like `<ejemploCodigoPostal>`), do NOT save it as valid — respond asking them
> to include it. Example: "Para completar tu pedido, necesito tu ZIP Code (ej: 10001).
> ¿Me lo puedes indicar?"

The AI is expected to:
1. **Re-ask** for the ZIP/postal code when an address is provided without one.
2. **Not create or save the order** until a valid postal code is present in the address text.

---

## Manual regression steps — Meta WhatsApp channel

Run after any edit to the Meta AI system prompt (`addressFormatContextMeta`):

1. Set up a test business with a country that has `requiereCodigoPostal = true`
   (e.g. United States, `etiquetaCodigoPostal = "ZIP Code"`, `ejemploCodigoPostal = "10001"`).
2. Send a WhatsApp message simulating a customer providing an address **without** a ZIP:
   > "Quiero pedir. Mi dirección es 123 Main St, New York, NY."
3. **Expected AI response**: The AI asks for the ZIP Code before accepting the order, e.g.:
   > "Para completar tu pedido, necesito tu ZIP Code (ej: 10001). ¿Me lo puedes indicar?"
4. Confirm that **no order is created** in the database at this point.
5. Reply with the ZIP: "10001".
6. **Expected outcome**: AI now accepts the address and proceeds to confirm the order.
7. Confirm the order is created with the full address including ZIP.

**Regression indicator**: If the AI accepts the address in step 3 without asking for ZIP,
or creates an order before step 5, the prompt guard has been broken.

---

## Manual regression steps — Evolution API channel

Same flow as Meta, but triggered via Evolution API webhook. Run after any edit to
`addressFormatContextEvol`:

1. Same business setup as above.
2. Send a message through the Evolution API integration (or use the Evolution webhook test tool)
   with an address missing the postal code.
3. **Expected AI response**: Re-asks for the ZIP before saving the address.
4. Confirm no order is created until the ZIP is provided.
5. Provide the ZIP → confirm order is created with the full address.

---

## Automated test — chat-web form (web channel)

The web channel has an automated vitest test that covers the frontend form guard:

**File**: `client/src/pages/__tests__/pedir-zip-validation.test.tsx`

| Test case | What it verifies |
|---|---|
| A — ZIP missing, required | `[data-testid="error-addr-cp"]` appears; no POST to `/api/chat-web/messages` |
| B — ZIP filled after error | Error clears on input; address including `ZIP Code: 10001` is sent |
| C — ZIP optional | Address submits without ZIP, no error shown |

Run with:
```bash
npx vitest run client/src/pages/__tests__/pedir-zip-validation.test.tsx
```

The server-side `validarZipEnDireccion()` helper (server/routes.ts ~line 147) also enforces
ZIP presence when an address is submitted from the chat-web AI text channel. Its logic:

1. **Explicit label match**: looks for `"ZIP Code: 10001"` (produced by the address form).
2. **Standalone digit group**: falls back to matching an exact-length digit sequence (e.g. 5
   digits for US) on word boundaries, so `"Apt 123"` doesn't false-positive.

---

## What to check after any prompt edit

- [ ] The `VALIDACIÓN ZIP OBLIGATORIA` block is still present in the relevant
  `addressFormatContext*` string for Meta, Evolution, and chat-web channels.
- [ ] The wording still instructs the AI to **re-ask** rather than silently skip the ZIP.
- [ ] The wording still says **do NOT save / do NOT create the order** until ZIP is present.
- [ ] The `validarZipEnDireccion()` server-side guard in `routes.ts` has not been removed
  (it acts as a safety net even if the AI prompt fails).
- [ ] Run the automated test suite: `npx vitest run`.

---

## How the ZIP prompt is injected (developer reference)

The injection is conditional: the `zipRequired*` boolean is set only when the colmado's
associated country record has both `requiereCodigoPostal = true` **and** a non-null
`etiquetaCodigoPostal`. If either is missing, the ZIP section is omitted from the prompt and
no validation occurs (fail-open to avoid blocking businesses that don't use postal codes).

```
// Pseudocode (actual code in server/routes.ts)
if (zipRequired) {
  addressFormatContext += `
  VALIDACIÓN ZIP OBLIGATORIA: Este negocio requiere ${etiquetaCP} en toda dirección.
  Si el cliente ya proporcionó su dirección pero NO contiene un código postal
  (secuencia de dígitos como ${ejCP || "10001"}), NO la guardes — responde pidiendo
  que incluya el ${etiquetaCP}. Ej: "Para completar tu pedido, necesito tu
  ${etiquetaCP} (ej: ${ejCP || "10001"}). ¿Me lo puedes indicar?"`;
}
```
