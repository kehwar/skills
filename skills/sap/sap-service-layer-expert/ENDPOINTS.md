# SAP Service Layer — Endpoints Reference

Curated index of the most commonly used Service Layer resources, grouped by module. For the complete list of ~600 resources, scan `assets/spec/paths/`.

> **How to use**: every resource has a collection URL (`/Resource`) and a single-record URL (`/Resource({key})`). Action functions are called with `POST /Resource({key})/{Action}` and an empty JSON body `{}`.

## Business Partners

### `BusinessPartners`

It represents the business partners master data in the Business Partners module. You can use this
data to record and retrieve business partner (customers, vendors, and leads) information and
schedule business partner activities.

| URL | Methods |
|-----|---------|
| `/BusinessPartners` | GET, POST |
| `/BusinessPartners('{key}')` | GET, PATCH, DELETE |


## Items & Inventory

### `Items`

| URL | Methods |
|-----|---------|
| `/Items` | GET, POST |
| `/Items('{key}')` | GET, PATCH, DELETE |
| `/Items('{key}')/Cancel` | POST |

### `ItemGroups`

It represents the definition of item groups in the Inventory module.

| URL | Methods |
|-----|---------|
| `/ItemGroups` | GET, POST |
| `/ItemGroups({key})` | GET, PATCH, DELETE |

### `Warehouses`

It represents the information of warehouses in the Inventory module.

| URL | Methods |
|-----|---------|
| `/Warehouses` | GET, POST |
| `/Warehouses('{key}')` | GET, PATCH, DELETE |

### `InventoryGenEntries`

It represents inventory gains in quantities not resulting from doing business with vendors, for
example, receipt from production.

| URL | Methods |
|-----|---------|
| `/InventoryGenEntries` | GET, POST |
| `/InventoryGenEntries({key})` | GET, PATCH |
| `/InventoryGenEntries({key})/Cancel` | POST |
| `/InventoryGenEntries({key})/Close` | POST |
| `/InventoryGenEntries({key})/CreateCancellationDocument` | POST |
| `/InventoryGenEntries({key})/Reopen` | POST |

### `GoodsReturnRequest`

A return is the clearing document for a delivery.

| URL | Methods |
|-----|---------|
| `/GoodsReturnRequest` | GET, POST |
| `/GoodsReturnRequest({key})` | GET, PATCH, DELETE |
| `/GoodsReturnRequest({key})/Cancel` | POST |
| `/GoodsReturnRequest({key})/Close` | POST |
| `/GoodsReturnRequest({key})/CreateCancellationDocument` | POST |
| `/GoodsReturnRequest({key})/Reopen` | POST |
| `/GoodsReturnRequest({key})/SaveDraftToDocument` | POST |

### `StockTransfers`

It represents transfer records of items from one warehouse to another.

| URL | Methods |
|-----|---------|
| `/StockTransfers` | GET, POST |
| `/StockTransfers({key})` | GET, PATCH, DELETE |
| `/StockTransfers({key})/Cancel` | POST |
| `/StockTransfers({key})/Close` | POST |

### `StockTransferDrafts`

| URL | Methods |
|-----|---------|
| `/StockTransferDrafts` | GET, POST |
| `/StockTransferDrafts({key})` | GET, PATCH |
| `/StockTransferDrafts({key})/Cancel` | POST |
| `/StockTransferDrafts({key})/Close` | POST |
| `/StockTransferDrafts({key})/SaveDraftToDocument` | POST |


## Sales

### `Quotations`

It is an offer or proposal that you send either to a customer or to a lead.

| URL | Methods |
|-----|---------|
| `/Quotations` | GET, POST |
| `/Quotations({key})` | GET, PATCH |
| `/Quotations({key})/Cancel` | POST |
| `/Quotations({key})/Close` | POST |
| `/Quotations({key})/CreateCancellationDocument` | POST |
| `/Quotations({key})/Reopen` | POST |

### `Orders`

It represents a commitment from a customer or lead to buy a product or service.

| URL | Methods |
|-----|---------|
| `/Orders` | GET, POST |
| `/Orders({key})` | GET, PATCH |
| `/Orders({key})/Cancel` | POST |
| `/Orders({key})/Close` | POST |
| `/Orders({key})/CreateCancellationDocument` | POST |
| `/Orders({key})/Reopen` | POST |

### `DeliveryNotes`

It is a legally binding document indicating that the shipment of goods or the delivery of services
has occurred.

| URL | Methods |
|-----|---------|
| `/DeliveryNotes` | GET, POST |
| `/DeliveryNotes({key})` | GET, PATCH, DELETE |
| `/DeliveryNotes({key})/Cancel` | POST |
| `/DeliveryNotes({key})/Close` | POST |
| `/DeliveryNotes({key})/CreateCancellationDocument` | POST |
| `/DeliveryNotes({key})/Reopen` | POST |

### `Returns`

A return is the clearing document for a delivery.

| URL | Methods |
|-----|---------|
| `/Returns` | GET, POST |
| `/Returns({key})` | GET, PATCH, DELETE |
| `/Returns({key})/Cancel` | POST |
| `/Returns({key})/Close` | POST |
| `/Returns({key})/CreateCancellationDocument` | POST |
| `/Returns({key})/Reopen` | POST |

### `Invoices`

| URL | Methods |
|-----|---------|
| `/Invoices` | GET, POST |
| `/Invoices({key})` | GET, PATCH |
| `/Invoices({key})/Cancel` | POST |
| `/Invoices({key})/Close` | POST |
| `/Invoices({key})/CreateCancellationDocument` | POST |
| `/Invoices({key})/Reopen` | POST |

### `CreditNotes`

It is the clearing document for invoices and returns. If the goods were delivered to the customer
and an invoice has already been created, you can partially or completely reverse the transaction by
creating a credit note.

| URL | Methods |
|-----|---------|
| `/CreditNotes` | GET, POST |
| `/CreditNotes({key})` | GET, PATCH, DELETE |
| `/CreditNotes({key})/Cancel` | POST |
| `/CreditNotes({key})/Close` | POST |
| `/CreditNotes({key})/CreateCancellationDocument` | POST |
| `/CreditNotes({key})/Reopen` | POST |

### `DownPayments`

It represents a document for ensuring that a customer is committed and will follow through with a
placed order.

| URL | Methods |
|-----|---------|
| `/DownPayments` | GET, POST |
| `/DownPayments({key})` | GET, PATCH, DELETE |
| `/DownPayments({key})/Cancel` | POST |
| `/DownPayments({key})/Close` | POST |
| `/DownPayments({key})/CreateCancellationDocument` | POST |
| `/DownPayments({key})/Reopen` | POST |

### `Drafts`

It is the preliminary version of a document or report.

| URL | Methods |
|-----|---------|
| `/Drafts` | GET, POST |
| `/Drafts({key})` | GET, PATCH, DELETE |
| `/Drafts({key})/Cancel` | POST |
| `/Drafts({key})/Close` | POST |
| `/Drafts({key})/CreateCancellationDocument` | POST |
| `/Drafts({key})/Reopen` | POST |


## Purchasing

### `PurchaseQuotations`

It represents an invitation to a number of vendors to find the best offer for goods or services that
you require.

| URL | Methods |
|-----|---------|
| `/PurchaseQuotations` | GET, POST |
| `/PurchaseQuotations({key})` | GET, PATCH |
| `/PurchaseQuotations({key})/Cancel` | POST |
| `/PurchaseQuotations({key})/Close` | POST |
| `/PurchaseQuotations({key})/CreateCancellationDocument` | POST |
| `/PurchaseQuotations({key})/Reopen` | POST |

### `PurchaseOrders`

It is a document used to request items or services from a vendor at an agreed upon price.

| URL | Methods |
|-----|---------|
| `/PurchaseOrders` | GET, POST |
| `/PurchaseOrders({key})` | GET, PATCH |
| `/PurchaseOrders({key})/Cancel` | POST |
| `/PurchaseOrders({key})/Close` | POST |
| `/PurchaseOrders({key})/CreateCancellationDocument` | POST |
| `/PurchaseOrders({key})/Reopen` | POST |

### `PurchaseDeliveryNotes`

It represents a legally binding document indicating that a shipment of goods or a delivery of
services has occurred.

| URL | Methods |
|-----|---------|
| `/PurchaseDeliveryNotes` | GET, POST |
| `/PurchaseDeliveryNotes({key})` | GET, PATCH, DELETE |
| `/PurchaseDeliveryNotes({key})/Cancel` | POST |
| `/PurchaseDeliveryNotes({key})/Close` | POST |
| `/PurchaseDeliveryNotes({key})/CreateCancellationDocument` | POST |
| `/PurchaseDeliveryNotes({key})/Reopen` | POST |

### `PurchaseReturns`

It is used to return delivered goods to vendors or to reverse completely or partially a purchasing
transaction for an item.

| URL | Methods |
|-----|---------|
| `/PurchaseReturns` | GET, POST |
| `/PurchaseReturns({key})` | GET, PATCH |
| `/PurchaseReturns({key})/Cancel` | POST |
| `/PurchaseReturns({key})/Close` | POST |
| `/PurchaseReturns({key})/CreateCancellationDocument` | POST |
| `/PurchaseReturns({key})/Reopen` | POST |

### `PurchaseInvoices`

It represents a request for payment. It also records the cost in a profit and loss statement.

| URL | Methods |
|-----|---------|
| `/PurchaseInvoices` | GET, POST |
| `/PurchaseInvoices({key})` | GET, PATCH |
| `/PurchaseInvoices({key})/Cancel` | POST |
| `/PurchaseInvoices({key})/Close` | POST |
| `/PurchaseInvoices({key})/CreateCancellationDocument` | POST |
| `/PurchaseInvoices({key})/Reopen` | POST |

### `PurchaseCreditNotes`

It represents the clearing document for the A/P invoice. Therefore, if the vendor has delivered
goods, and you have already created an A/P invoice, you can reverse the transaction either partially
or completely by creating a purchase credit note.

| URL | Methods |
|-----|---------|
| `/PurchaseCreditNotes` | GET, POST |
| `/PurchaseCreditNotes({key})` | GET, PATCH, DELETE |
| `/PurchaseCreditNotes({key})/Cancel` | POST |
| `/PurchaseCreditNotes({key})/Close` | POST |
| `/PurchaseCreditNotes({key})/CreateCancellationDocument` | POST |
| `/PurchaseCreditNotes({key})/Reopen` | POST |

### `PurchaseDownPayments`

It represents a document to ensure that a customer is committed and will follow through with a
placed order.

| URL | Methods |
|-----|---------|
| `/PurchaseDownPayments` | GET, POST |
| `/PurchaseDownPayments({key})` | GET, PATCH, DELETE |
| `/PurchaseDownPayments({key})/Cancel` | POST |
| `/PurchaseDownPayments({key})/Close` | POST |
| `/PurchaseDownPayments({key})/CreateCancellationDocument` | POST |
| `/PurchaseDownPayments({key})/Reopen` | POST |


## Payments & Banking

### `IncomingPayments`

It represents incoming payments from customers or, for returned goods, from vendors. Available
payment methods are cash, credit cards, checks, bank transfers, and in some localizations, bills of
exchange.

| URL | Methods |
|-----|---------|
| `/IncomingPayments` | GET, POST |
| `/IncomingPayments({key})` | GET, PATCH |
| `/IncomingPayments({key})/Cancel` | POST |
| `/IncomingPayments({key})/CancelbyCurrentSystemDate` | POST |
| `/IncomingPayments({key})/GetApprovalTemplates` | POST |
| `/IncomingPayments({key})/RequestApproveCancellation` | POST |

### `Deposits`

| URL | Methods |
|-----|---------|
| `/Deposits` | GET, POST |
| `/Deposits({key})` | GET, PATCH |
| `/Deposits({key})/CancelDeposit` | POST |
| `/Deposits({key})/CancelDepositbyCurrentSystemDate` | POST |


## Accounting

### `JournalEntries`

It represents journal transactions.

| URL | Methods |
|-----|---------|
| `/JournalEntries` | GET, POST |
| `/JournalEntries({key})` | GET, PATCH |
| `/JournalEntries({key})/Cancel` | POST |

### `ChartOfAccounts`

It represents the General Ledger (G/L) accounts in the Finance module. The Chart of Accounts is an
index of all G/L accounts that are used by one or more companies. For every G/L account there is an
account number, an account description, and information that determines the function of the account.

| URL | Methods |
|-----|---------|
| `/ChartOfAccounts` | GET, POST |
| `/ChartOfAccounts('{key}')` | GET, PATCH, DELETE |

### `ProfitCenters`

| URL | Methods |
|-----|---------|
| `/ProfitCenters` | GET, POST |
| `/ProfitCenters('{key}')` | GET, PATCH, DELETE |


## Pricing

### `PriceLists`

It represents the management of price lists in the Inventory module. An item can have several
prices, with each based on a different price list, for example, purchase price list, sales price
list, distributor price list, and so on.

| URL | Methods |
|-----|---------|
| `/PriceLists` | GET, POST |
| `/PriceLists({key})` | GET, PATCH, DELETE |

### `SpecialPrices`

It represents a discount for a specific item in a specific price list. The discount can apply to a
specific business partner or for all business partners. For a specific business partner, the item
and business partner must be unique; for all business partners, the item and price list must be
unique.

| URL | Methods |
|-----|---------|
| `/SpecialPrices` | GET, POST |
| `/SpecialPrices({key})` | GET, PATCH, DELETE |


## Master Data

### `Currencies`

It represents the currency codes in the Administration module.

| URL | Methods |
|-----|---------|
| `/Currencies` | GET, POST |
| `/Currencies('{key}')` | GET, PATCH, DELETE |

### `PaymentTermsTypes`

It represents the types of payment terms in the Banking module. The payment terms define typical
agreements that apply to transactions with customers and vendors.

| URL | Methods |
|-----|---------|
| `/PaymentTermsTypes` | GET, POST |
| `/PaymentTermsTypes({key})` | GET, PATCH, DELETE |

### `SalesTaxCodes`

It represents the inclusive sales tax codes. Each sales tax code consists of one or more sales
taxes.

| URL | Methods |
|-----|---------|
| `/SalesTaxCodes` | GET, POST |
| `/SalesTaxCodes('{key}')` | GET, PATCH, DELETE |

### `VatGroups`

It defines tax groups that can be assigned to business partners and items in sales and purchase
documents.

| URL | Methods |
|-----|---------|
| `/VatGroups` | GET, POST |
| `/VatGroups('{key}')` | GET, PATCH, DELETE |

### `Countries`

It manages the settings of each country, such as country code, country name and address format.

| URL | Methods |
|-----|---------|
| `/Countries` | GET, POST |
| `/Countries('{key}')` | GET, PATCH, DELETE |

### `UnitOfMeasurements`

| URL | Methods |
|-----|---------|
| `/UnitOfMeasurements` | GET, POST |
| `/UnitOfMeasurements({key})` | GET, PATCH, DELETE |

### `UnitOfMeasurementGroups`

| URL | Methods |
|-----|---------|
| `/UnitOfMeasurementGroups` | GET, POST |
| `/UnitOfMeasurementGroups({key})` | GET, PATCH, DELETE |

### `SalesPersons`

It defines sales employees and their commission rates.

| URL | Methods |
|-----|---------|
| `/SalesPersons` | GET, POST |
| `/SalesPersons({key})` | GET, PATCH, DELETE |

