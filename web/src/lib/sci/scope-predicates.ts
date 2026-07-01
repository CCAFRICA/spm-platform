// HF-341 R4: single-source scope predicates over the LLM's FREE-FORM `identifies` channel (OB-231).
// These read the model's own words for WHAT a column identifies — entity (a recurring seller/person/
// account) vs transaction (a per-row event id: folio/receipt/invoice). They are NOT a role-term
// vocabulary the LLM must pick from, and NOT a column-name list — they match the model's free-form
// scope expression structurally (Korean Test: open-vocabulary nature, matched by structural word
// classes, extensible by recognition, not by a developer editing a closed set). One source so the
// sheet classifier and the entity-id resolver read the SAME canonical scope surface.
export const ENTITY_SCOPE = /\b(entity|entidad|seller|vendedor|employee|empleado|person|persona|account|cuenta|organization|organizaci[oó]n|member|miembro|rep|staff|worker|salesperson|agent|agente)\b/i;
export const TXN_SCOPE = /\b(transaction|transacci[oó]n|receipt|recibo|folio|invoice|factura|order|pedido|ticket|event|evento|record|registro|line|l[ií]nea)\b/i;
export const IDENTIFIER_NATURE = /\b(identifier|identif|\bid\b|document|documento|dni|code|c[oó]digo|n[uú]mero|key|clave)\b/i;
// HF-367: the model's free-form `data_nature` MEASURE and TEMPORAL channels, read the same
// way (structural word classes, multilingual, single-source) so the sheet classifier reads
// the model's own nature assessment — never the `characterization` prose blob. These join
// IDENTIFIER_NATURE as the canonical readers of the dedicated `data_nature` channel.
export const MEASURE_NATURE = /\b(measure|medida|amount|monto|importe|metric|m[eé]trica|quantity|cantidad|numeric|num[eé]rico|monetary|monetario|currency|moneda|value|valor)\b/i;
export const TEMPORAL_NATURE = /\b(temporal|date|fecha|time|tiempo|month|mes|year|a[ñn]o|period|periodo|per[ií]odo|day|d[ií]a|quarter|trimestre|week|semana)\b/i;
