#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Servo.h>

// Configure these values before upload. Use a trusted local Wi-Fi network.
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_BASE = "http://192.168.1.100:3000"; // Change to PC's LAN IPv4 address
const char* DEVICE_TOKEN = "change-this-to-another-long-random-value";

const uint8_t SERVO_PIN = D5;
const uint16_t POLL_INTERVAL_MS = 1500;
Servo servoMotor;
unsigned long lastPoll = 0;

bool dispenseChannel(uint8_t channel) {
  if (channel != 1) return false;

  // SAFETY SCAFFOLD ONLY:
  // SG90/MG90S positional servos usually cannot continuously rotate a spiral coil.
  // This does not claim to dispense; it keeps the servo near neutral and fails closed.
  servoMotor.write(90);
  delay(300);
  return false; // Only change after fitting a suitable mechanism and confirmation sensor.
}

void postResult(const String& commandId, bool success, const String& detail) {
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClient client;
  HTTPClient http;
  const String url = String(SERVER_BASE) + "/api/device/result";
  if (!http.begin(client, url)) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);
  String body = "{\"commandId\":\"" + commandId + "\",\"success\":" +
                String(success ? "true" : "false") + ",\"detail\":\"" + detail + "\"}";
  int code = http.POST(body);
  Serial.printf("Result HTTP %d\n", code);
  http.end();
}

void pollCommand() {
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, String(SERVER_BASE) + "/api/device/next")) return;
  http.addHeader("x-device-token", DEVICE_TOKEN);
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    const String key = "\"commandId\":\"";
    int start = body.indexOf(key);
    if (start >= 0) {
      start += key.length();
      int end = body.indexOf('"', start);
      if (end > start) {
        String commandId = body.substring(start, end);
        bool success = dispenseChannel(1);
        postResult(commandId, success, success ? "dispensed" : "mechanism_not_configured");
      }
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  servoMotor.attach(SERVO_PIN);
  servoMotor.write(90);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println();
  Serial.print("ESP8266 IP: "); Serial.println(WiFi.localIP());
}

void loop() {
  if (millis() - lastPoll >= POLL_INTERVAL_MS) {
    lastPoll = millis();
    pollCommand();
  }
}