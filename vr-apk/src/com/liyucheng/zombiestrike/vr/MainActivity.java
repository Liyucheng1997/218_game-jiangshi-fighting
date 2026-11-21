package com.liyucheng.zombiestrike.vr;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

/** 无界面启动器：确保本地服务在跑，然后交给头显浏览器（WebXR）。 */
public class MainActivity extends Activity {
    static final String[] BROWSERS = { "com.pico.browser", "com.oculus.browser", "com.igalia.wolvic", "com.android.chrome" };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        boolean ok = GameServer.ensureStarted(getApplicationContext());
        Intent svc = new Intent(this, ServerService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc); else startService(svc);
        if (!ok) Toast.makeText(this, "本地服务启动失败（端口 " + GameServer.PORT + " 被占用？）", Toast.LENGTH_LONG).show();
        else open();
        finish();
    }

    private void open() {
        Uri url = Uri.parse("http://localhost:" + GameServer.PORT + "/index.html?vr=1");
        for (int i = 0; i <= BROWSERS.length; i++) {
            Intent v = new Intent(Intent.ACTION_VIEW, url);
            v.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            // 同一来源复用同一个标签页，不会越开越多
            v.putExtra("com.android.browser.application_id", getPackageName());
            if (i < BROWSERS.length) v.setPackage(BROWSERS[i]);
            try { startActivity(v); return; } catch (Exception e) { /* 试下一个 */ }
        }
        Toast.makeText(this, "没有找到可用的浏览器", Toast.LENGTH_LONG).show();
    }
}
