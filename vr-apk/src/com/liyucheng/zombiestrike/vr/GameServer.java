package com.liyucheng.zombiestrike.vr;

import android.content.Context;
import android.content.res.AssetManager;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 只监听回环地址的极简静态文件服务：把 APK 里 assets/www 下的游戏文件交给浏览器。
 * 之所以要它：WebXR 只在安全来源可用，http://localhost 算安全来源，file:// 不算。
 */
public final class GameServer {
    public static final int PORT = 20808;
    public static volatile long lastRequest = System.currentTimeMillis();
    private static ServerSocket server;
    private static ExecutorService pool;

    private GameServer() {}

    public static synchronized boolean ensureStarted(final Context ctx) {
        if (server != null && !server.isClosed()) return true;
        final ServerSocket[] box = new ServerSocket[1];
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                try { box[0] = new ServerSocket(PORT, 64, InetAddress.getByName("127.0.0.1")); } catch (Exception e) { box[0] = null; }
            }
        });
        t.start();
        try { t.join(3000); } catch (InterruptedException e) { /* ignore */ }
        if (box[0] == null) return false;
        server = box[0];
        pool = Executors.newFixedThreadPool(6);
        final ServerSocket s = server;
        final ExecutorService p = pool;
        final AssetManager am = ctx.getAssets();
        Thread loop = new Thread(new Runnable() {
            @Override public void run() {
                while (!s.isClosed()) {
                    try {
                        final Socket c = s.accept();
                        p.execute(new Runnable() { @Override public void run() { handle(c, am); } });
                    } catch (Exception e) { /* 关闭时会抛出，循环条件负责退出 */ }
                }
            }
        }, "game-http");
        loop.setDaemon(true);
        loop.start();
        return true;
    }

    public static synchronized void stop() {
        try { if (server != null) server.close(); } catch (Exception e) { /* ignore */ }
        if (pool != null) pool.shutdownNow();
        server = null; pool = null;
    }

    private static void handle(Socket c, AssetManager am) {
        try {
            c.setSoTimeout(15000);
            lastRequest = System.currentTimeMillis();
            BufferedReader in = new BufferedReader(new InputStreamReader(c.getInputStream(), "ISO-8859-1"));
            String line = in.readLine();
            if (line == null) return;
            String[] parts = line.split(" ");
            String h;
            while ((h = in.readLine()) != null && h.length() > 0) { /* 丢弃请求头 */ }
            OutputStream out = c.getOutputStream();
            if (parts.length < 2 || !(parts[0].equals("GET") || parts[0].equals("HEAD"))) { send(out, "405 Method Not Allowed", "text/plain", new byte[0], false); return; }
            boolean withBody = !parts[0].equals("HEAD");
            String path = parts[1];
            int q = path.indexOf('?'); if (q >= 0) path = path.substring(0, q);
            int f = path.indexOf('#'); if (f >= 0) path = path.substring(0, f);
            path = URLDecoder.decode(path, "UTF-8");
            if (path.endsWith("/")) path += "index.html";
            if (path.contains("..")) { send(out, "403 Forbidden", "text/plain", new byte[0], false); return; }
            byte[] body;
            try {
                InputStream is = am.open("www" + path);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int n;
                while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                is.close();
                body = bo.toByteArray();
            } catch (Exception e) {
                send(out, "404 Not Found", "text/plain", "not found".getBytes("UTF-8"), withBody);
                return;
            }
            send(out, "200 OK", mime(path), body, withBody);
        } catch (Exception e) {
            /* 连接中断，忽略 */
        } finally {
            try { c.close(); } catch (Exception e) { /* ignore */ }
        }
    }

    private static void send(OutputStream out, String status, String type, byte[] body, boolean withBody) throws Exception {
        String head = "HTTP/1.1 " + status + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-cache\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes("ISO-8859-1"));
        if (withBody) out.write(body);
        out.flush();
    }

    private static String mime(String p) {
        String s = p.toLowerCase();
        if (s.endsWith(".html")) return "text/html; charset=utf-8";
        if (s.endsWith(".js") || s.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (s.endsWith(".css")) return "text/css; charset=utf-8";
        if (s.endsWith(".json")) return "application/json";
        if (s.endsWith(".png")) return "image/png";
        if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
        if (s.endsWith(".svg")) return "image/svg+xml";
        if (s.endsWith(".woff2")) return "font/woff2";
        if (s.endsWith(".woff")) return "font/woff";
        if (s.endsWith(".ttf")) return "font/ttf";
        if (s.endsWith(".wasm")) return "application/wasm";
        if (s.endsWith(".mp3")) return "audio/mpeg";
        if (s.endsWith(".ogg")) return "audio/ogg";
        if (s.endsWith(".wav")) return "audio/wav";
        if (s.endsWith(".gltf")) return "model/gltf+json";
        if (s.endsWith(".glb")) return "model/gltf-binary";
        return "application/octet-stream";
    }
}
