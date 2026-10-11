# Pine Labs A910 integration checklist

Do not assume merchant activation for standalone card/UPI payments automatically provides application-integrated payment access.

Before coding the payment adapter, ask Pine Labs integration support/relationship manager for:

1. Written confirmation whether the A910 and merchant ID support Cloud Integration, and whether it is enabled for this merchant.
2. If Cloud Integration is not supported, the officially supported alternative for a separate Android tablet storefront. Clarify whether A910 App-to-App integration requires an app to run on the terminal itself.
3. UAT credentials, merchant/terminal identifiers and a test environment.
4. Official API specification for transaction initiation, reference IDs, status verification, cancellation/void/refund, and reconciliation.
5. Required authentication/signature validation, network allowlists, certificates, callback/webhook behaviour and retry/idempotency rules.
6. Test cases, certification process and production enablement sign-off.

## Required order lifecycle

- Create a local order with a server-generated UUID.
- Initiate a payment only via a server-side adapter using official configuration.
- Store provider transaction reference against the order.
- Verify final payment status with the approved provider status flow. Never trust a query/body from the browser as proof of payment.
- Only after verified success, enqueue one unique dispense command.
- On cancellation, decline, timeout, or unknown state, do not dispense. Reconcile unknown outcomes before retrying a charge.
- Log provider references and status transitions without recording card data, PINs, CVVs, or other sensitive payment credentials.

## Official docs

- https://developer.pinelabs.com/in/instore/integration-guide
- https://developer.pinelabs.com/in/instore/cloud-integration
- https://developer.pinelabs.com/in/instore/faqs

No live payment integration has been implemented in this prototype yet.
