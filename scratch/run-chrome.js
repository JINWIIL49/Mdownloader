import { exec } from 'child_process';
import WebSocket from 'ws';

const CHROME_PATH = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"';
const PORT = 9222;

console.log('Starting Chrome...');
const chromeProcess = exec(`${CHROME_PATH} --headless=new --remote-debugging-port=${PORT} --disable-gpu --no-sandbox`);

chromeProcess.on('error', (err) => {
  console.error('Failed to start Chrome:', err);
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  await sleep(2000); // Wait for Chrome to boot
  
  try {
    // 1. Create a new tab page pointing to the deployed site
    const targetUrl = 'https://mdownloader.onginjokelvin31.workers.dev/';
    console.log(`Creating tab for: ${targetUrl}`);
    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
    if (!newTabRes.ok) {
      throw new Error(`Failed to create new tab: ${newTabRes.statusText}`);
    }
    const tabInfo = await newTabRes.json();
    console.log('Tab Info:', tabInfo);
    
    const wsUrl = tabInfo.webSocketDebuggerUrl;
    if (!wsUrl) {
      throw new Error('No webSocketDebuggerUrl found in tab info');
    }
    
    console.log(`Connecting to WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    
    ws.on('open', () => {
      console.log('Connected to debugger. Enabling domains...');
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({ id: 2, method: 'Console.enable' }));
      ws.send(JSON.stringify({ id: 3, method: 'Log.enable' }));
    });
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      
      // Capture log messages
      if (msg.method === 'Console.messageAdded') {
        const text = msg.params?.message?.text;
        const level = msg.params?.message?.level;
        console.log(`[Browser Console - ${level}]`, text);
      }
      
      if (msg.method === 'Log.entryAdded') {
        const text = msg.params?.entry?.text;
        const level = msg.params?.entry?.level;
        console.log(`[Browser Log - ${level}]`, text);
      }
      
      // Capture runtime exceptions
      if (msg.method === 'Runtime.exceptionThrown') {
        const exceptionDetails = msg.params?.exceptionDetails;
        const text = exceptionDetails?.exception?.description || exceptionDetails?.text;
        console.error('[Browser Runtime Exception]', text, JSON.stringify(exceptionDetails, null, 2));
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed.');
    });

    // Wait 10 seconds to collect console logs and errors, then clean up
    await sleep(10000);
    ws.close();
  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    console.log('Killing Chrome...');
    chromeProcess.kill();
  }
}

main().catch(console.error);
