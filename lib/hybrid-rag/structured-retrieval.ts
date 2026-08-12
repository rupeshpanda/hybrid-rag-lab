// ─────────────────────────────────────────────────────────────────────────
// Structured retrieval — exact facts from the simulated system of record.
// No semantic search here on purpose: invoice amounts, dates, quantities
// and prior refunds are looked up, not "retrieved by similarity."
// ─────────────────────────────────────────────────────────────────────────

import type { ExtractedEntities, Citation } from "./types";
import {
  creditMemosForInvoice,
  findDistributorById,
  findDistributorByName,
  findInvoiceById,
  findProductById,
  findProductByName,
  findReturnReferencingInvoiceText,
  findSalesOrderById,
  returns,
} from "./data";
import type { CreditMemo, Distributor, Invoice, Product, ReturnRecord, SalesOrder } from "./types";

export type StructuredResult = {
  distributor: Distributor | null;
  invoice: Invoice | null;
  salesOrder: SalesOrder | null;
  returnRecord: ReturnRecord | null;
  existingCreditMemos: CreditMemo[];
  product: Product | null;
  citations: Citation[];
  notFound: string[];
};

export function runStructuredRetrieval(entities: ExtractedEntities, rawMessage: string): StructuredResult {
  const citations: Citation[] = [];
  const notFound: string[] = [];

  const distributor =
    (entities.distributor_id && findDistributorById(entities.distributor_id)) ||
    (entities.distributor_name && findDistributorByName(entities.distributor_name)) ||
    null;
  if (entities.distributor_name && !distributor) notFound.push(`distributor "${entities.distributor_name}"`);
  if (distributor) citations.push({ label: distributor.name, type: "distributor" });

  let invoice: Invoice | null = null;
  if (entities.invoice_id) {
    invoice = findInvoiceById(entities.invoice_id);
    if (!invoice) {
      // Might be a return that references an invoice number that does not exist in structured data.
      const orphanReturn = findReturnReferencingInvoiceText(entities.invoice_id);
      if (orphanReturn) {
        notFound.push(`invoice "${entities.invoice_id}" (referenced by return ${orphanReturn.id}, not found in structured records)`);
      } else {
        notFound.push(`invoice "${entities.invoice_id}"`);
      }
    }
  } else {
    const orphanReturn = findReturnReferencingInvoiceText(rawMessage);
    if (orphanReturn) notFound.push(`invoice "${orphanReturn.invoice_reference_raw}" (referenced by return ${orphanReturn.id}, not found in structured records)`);
  }
  if (invoice) citations.push({ label: invoice.id, type: "invoice" });

  // Find a matching return record. Only fall back to "the distributor's most relevant open return"
  // for intents that are actually about processing or checking a return — a general policy or
  // invoice-status question about a distributor should not silently drag in an unrelated return.
  let returnRecord: ReturnRecord | null = null;
  const returnRelevantIntent = entities.intent === "process_return" || entities.intent === "warranty_question";
  if (invoice) {
    returnRecord = returns.find((r) => r.invoice_id === invoice!.id) ?? null;
  } else if (distributor && returnRelevantIntent) {
    returnRecord = returns.find((r) => r.distributor_id === distributor.id) ?? null;
  }
  if (returnRecord) citations.push({ label: returnRecord.id, type: "return" });

  // If a return was resolved by distributor rather than by an explicit invoice number, back-fill
  // the invoice, sales order, and credit memos it references so the evidence stays consistent —
  // otherwise the agent would see a return but incorrectly report its invoice as "not found."
  if (!invoice && returnRecord?.invoice_id) {
    invoice = findInvoiceById(returnRecord.invoice_id);
    if (invoice) citations.push({ label: invoice.id, type: "invoice" });
  }

  const salesOrder = invoice ? findSalesOrderById(invoice.sales_order_id) : null;
  if (salesOrder) citations.push({ label: salesOrder.id, type: "sales_order" });

  const existingCreditMemos = invoice ? creditMemosForInvoice(invoice.id) : [];
  for (const cm of existingCreditMemos) citations.push({ label: cm.id, type: "credit_memo" });

  const product =
    (entities.product_id && findProductById(entities.product_id)) ||
    (invoice && findProductById(invoice.product_id)) ||
    (entities.product_id && findProductByName(entities.product_id)) ||
    null;

  const resolvedDistributor = distributor ?? (invoice ? findDistributorById(invoice.distributor_id) : null);

  return {
    distributor: resolvedDistributor,
    invoice,
    salesOrder,
    returnRecord,
    existingCreditMemos,
    product,
    citations,
    notFound,
  };
}
