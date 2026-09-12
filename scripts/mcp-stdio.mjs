#!/usr/bin/env node
// A dependency-free stdio bridge for clients affected by system HTTP proxies.
// node:http connects directly to loopback; all MCP operations still go through
// the running RunProject app, its authentication, and its database transactions.
import http from 'node:http';
import readline from 'node:readline';

const token = process.env.RUNPROJECT_MCP_TOKEN;
if (!token) {
  process.stderr.write('RunProject MCP: RUNPROJECT_MCP_TOKEN is required.\n');
  process.exit(1);
}
let protocolVersion = '2025-11-25';
function reply(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); }
  catch { reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return; }
  const hasId = Object.hasOwn(message, 'id');
  const fail = (reason) => {
    if (hasId) reply({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: `RunProject MCP: ${reason}` } });
    else process.stderr.write(`RunProject MCP: ${reason}\n`);
  };
  const payload = Buffer.from(line);
  if (payload.length > 1024 * 1024) { fail('request exceeds 1 MiB'); return; }
  const version = message.params?._meta?.['io.modelcontextprotocol/protocolVersion'] ?? protocolVersion;
  const request = http.request({
    hostname: '127.0.0.1', port: 1421, path: '/mcp', method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': version,
      'Content-Length': payload.length,
    },
    timeout: 120_000,
  }, (response) => {
    let bytes = 0;
    const chunks = [];
    response.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 32 * 1024 * 1024) response.destroy(new Error('response exceeds 32 MiB'));
      else chunks.push(chunk);
    });
    response.on('error', (error) => fail(error.message));
    response.on('end', () => {
      if (response.statusCode === 202 || response.statusCode === 204) return;
      if (response.statusCode < 200 || response.statusCode >= 300) { fail(`HTTP ${response.statusCode}; check that RunProject is running and the token is valid`); return; }
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return;
      try {
        const result = JSON.parse(raw);
        if (message.method === 'initialize' && result.result?.protocolVersion) protocolVersion = result.result.protocolVersion;
        reply(result);
      } catch { fail('expected a JSON response from the local MCP service'); }
    });
  });
  request.on('timeout', () => request.destroy(new Error('request timed out')));
  request.on('error', (error) => fail(error.code === 'ECONNREFUSED' ? '请先启动 RunProject 桌面应用' : error.message));
  request.end(payload);
});
input.on('close', () => process.exit(0));
