import type { FastifyPluginAsync } from "fastify";

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>OpenSearch Analyzer — Embed demo</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; background: #f2f3f3; color: #16191f; }
  header { background: #232f3e; color: #fff; padding: 12px 20px; display: flex; gap: 12px; align-items: center; }
  header h1 { font-size: 16px; margin: 0; font-weight: 500; }
  header .pill { background: #ff9900; color: #16191f; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .container { padding: 20px; }
  .controls { background: #fff; border: 1px solid #d5dbdb; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .controls h2 { font-size: 14px; margin: 0 0 8px; }
  .controls label { font-size: 12px; color: #545b64; display: block; margin-bottom: 4px; }
  .controls input { width: 100%; padding: 6px 8px; border: 1px solid #aab7b8; border-radius: 4px; font-family: inherit; font-size: 13px; box-sizing: border-box; }
  .controls button { background: #0073bb; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; margin-top: 8px; }
  .controls button:hover { background: #005a96; }
  #status { font-size: 12px; color: #545b64; margin-top: 8px; }
  iframe { width: 100%; height: calc(100vh - 260px); border: 1px solid #d5dbdb; border-radius: 8px; background: #fff; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
</style>
</head>
<body>
  <header>
    <h1>OpenSearch Analyzer</h1>
    <span class="pill">EMBED DEMO</span>
    <span style="margin-left: auto; font-size: 12px; opacity: 0.8;">Simulates how the AWS OpenSearch console would host this app.</span>
  </header>
  <div class="container">
    <div class="controls">
      <h2>Push a domain context to the iframe (postMessage osa.select-domain)</h2>
      <div class="row">
        <div>
          <label for="arn">Domain ARN</label>
          <input id="arn" type="text" value="arn:aws:es:us-west-2:282384924069:domain/ma-solr-test-dev2" />
        </div>
        <div>
          <label for="region">Region</label>
          <input id="region" type="text" value="us-west-2" />
        </div>
      </div>
      <button id="send">Send select-domain</button>
      <div id="status">Waiting for iframe to post osa.ready…</div>
    </div>

    <iframe
      id="osa"
      src="http://localhost:5173/?embed=1"
      title="OpenSearch Analyzer (embedded)"
      sandbox="allow-scripts allow-same-origin allow-forms"
    ></iframe>
  </div>

  <script>
    const iframe = document.getElementById('osa');
    const status = document.getElementById('status');
    const sendBtn = document.getElementById('send');
    let childReady = false;

    window.addEventListener('message', (e) => {
      // Only accept messages from the iframe.
      if (e.origin !== 'http://localhost:5173') return;
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'osa.ready') {
        childReady = true;
        status.textContent = '✓ Iframe announced osa.ready — you can push a domain.';
      }
    });

    function pushDomain() {
      const arn = document.getElementById('arn').value.trim();
      const region = document.getElementById('region').value.trim();
      if (!arn) return;
      iframe.contentWindow.postMessage(
        { type: 'osa.select-domain', arn: arn, region: region },
        'http://localhost:5173'
      );
      status.textContent = '→ Sent osa.select-domain { arn: ' + arn + ' } at ' + new Date().toLocaleTimeString();
    }

    sendBtn.addEventListener('click', pushDomain);
  </script>
</body>
</html>`;

export const embedDemoRoute: FastifyPluginAsync = async (app) => {
  app.get("/embed-demo", async (_req, reply) => {
    reply.header("content-type", "text/html; charset=utf-8");
    return HTML;
  });
};
