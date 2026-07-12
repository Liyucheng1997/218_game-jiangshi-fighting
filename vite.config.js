import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// 开发辅助：接收页面 POST 的画面截图，写入 .captures/ 供调试查看
function capturePlugin() {
  return {
    name: 'dev-capture',
    configureServer(server) {
      server.middlewares.use('/__cap', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const m = body.match(/^data:image\/(png|jpeg);base64,(.+)$/s);
            if (!m) { res.statusCode = 400; return res.end('bad data'); }
            const name = (req.headers['x-cap-name'] || 'cap').toString().replace(/[^\w-]/g, '');
            const dir = path.resolve('.captures');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${name}.${m[1] === 'jpeg' ? 'jpg' : 'png'}`);
            fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
            res.end('ok:' + file);
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [capturePlugin()],
});
