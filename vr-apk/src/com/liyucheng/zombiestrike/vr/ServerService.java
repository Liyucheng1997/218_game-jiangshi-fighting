package com.liyucheng.zombiestrike.vr;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/** 前台服务：让进程（和里面的本地 HTTP 服务）在浏览器游玩期间不被系统回收。 */
public class ServerService extends Service {
    static final long IDLE_MS = 3L * 60 * 60 * 1000;   // 3 小时无请求则自行退出
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable watchdog = new Runnable() {
        @Override public void run() {
            if (System.currentTimeMillis() - GameServer.lastRequest > IDLE_MS) { stopForeground(true); stopSelf(); return; }
            handler.postDelayed(this, 10 * 60 * 1000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel("game", "游戏服务", NotificationManager.IMPORTANCE_LOW));
        Notification n = new Notification.Builder(this, "game")
                .setContentTitle("真理斗僵尸 VR")
                .setContentText("游戏本地服务运行中")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .build();
        startForeground(1, n);
        handler.postDelayed(watchdog, 10 * 60 * 1000);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        GameServer.ensureStarted(getApplicationContext());
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(watchdog);
        GameServer.stop();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
