import handler from "../api/server.js";
import { EventEmitter } from "events";

class MockRequest extends EventEmitter {
  constructor() {
    super();
    this.method = "GET";
    this.url = "/assets/index-CziAkPWl.js";
    this.headers = {
      host: "localhost:3000",
    };
  }
}

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.body = "";
    this.decoder = new TextDecoder();
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  write(chunk) {
    this.body += this.decoder.decode(chunk, { stream: true });
  }

  end() {
    // Flush decoder
    this.body += this.decoder.decode();
    console.log("--- MOCK RESPONSE ---");
    console.log("Status:", this.statusCode);
    console.log("Headers:", JSON.stringify(this.headers, null, 2));
    console.log("Body length:", this.body.length);
    console.log("Body preview:");
    console.log(this.body);
    console.log("---------------------");
  }
}

async function test() {
  const req = new MockRequest();
  const res = new MockResponse();
  await handler(req, res);
}

test().catch(console.error);
