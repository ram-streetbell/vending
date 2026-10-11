# Vending Machine Prototype

Local-LAN vending machine starter using Node.js, Express, SQLite, an Android tablet storefront, a PC admin panel, and an ESP8266 controller scaffold.

## Included

- `server.js`: API, SQLite tables, product catalogue, order creation, admin product/inventory routes, authenticated ESP8266 polling/results.
- `public/index.html`: tablet-friendly product selection and test-order flow.
- `public/admin.html`: local admin panel for products, inventory, and recent orders.
- `esp8266/vending_controller.ino`: ESP8266 Wi-Fi controller scaffold.
- `.env.example`: local environment configuration template.

## Important unfinished integrations

**Pine Labs is not connected yet.** A merchant account that accepts standalone transactions may not have integrated-payment access enabled. Request confirmation of the correct Cloud Integration or A910-supported integration method, UAT credentials, API specifications, transaction status verification, cancellation/reconciliation rules, and production enablement process from Pine Labs. This project deliberately refuses to mark an order paid or initiate a payment without that approved integration.

**Dispensing is not production-ready.** The SG90/MG90S is normally a positional servo, not a continuous-rotation spiral-coil drive. Firmware currently fails closed and reports a failed dispense rather than claiming a successful vend. Select and test an appropriate mechanism and add a reliable dispense confirmation sensor before enabling physical dispensing.

## Run locally on Windows

1. Install Node.js LTS: https://nodejs.org/en/download
2. Open PowerShell in the repository folder.
3. Install packages:

   ```powershell
   npm install
   ```

4. Copy `.env.example` to `.env` and replace the two placeholder secrets with different, long random values.
5. Start the server:

   ```powershell
   npm start
   ```

6. Open:
   - Customer storefront: http://localhost:3000
   - Admin dashboard: http://localhost:3000/admin.html
   - Health check: http://localhost:3000/api/health

Find the PC's LAN IPv4 using `ipconfig`. The tablet can visit `http://PC_LAN_IP:3000` when connected to the same trusted Wi-Fi network. Allow Node.js through Windows Firewall only on a private network.

## Configure ESP8266

1. Install ESP8266 board support in Arduino IDE.
2. Edit `esp8266/vending_controller.ino`: Wi-Fi SSID, password, backend LAN IP and token.
3. Use the same `DEVICE_TOKEN` configured in `.env`.
4. Select the correct NodeMCU board and upload. Serial Monitor is 115200 baud.
5. Use a correctly rated separate servo supply and common ground; never power a servo directly from an ESP8266 GPIO.

## Security notes

This is a development prototype. Keep it on a trusted LAN; do not port-forward it to the internet. Before commercial use, add real user accounts/roles, HTTPS, rate limiting, input/security review, audit trails, backups, recovery handling, payment webhooks/status polling with signature or authenticated verification, and physical vend sensors. Never trust a browser redirect or callback alone as proof of payment.

## Pine Labs reference links

- https://developer.pinelabs.com/in/instore/integration-guide
- https://developer.pinelabs.com/in/instore/cloud-integration
- https://developer.pinelabs.com/in/instore/faqs
