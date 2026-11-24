package net.danlab.avzonazul;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Notificación fija con la cuenta atrás del ticket (y botón «Volver al coche»).
 */
@CapacitorPlugin(name = "Ticket")
public class TicketPlugin extends Plugin {

    private static final String CHANNEL = "ticket_live";
    private static final int ID = 4242;

    private NotificationManager manager() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void show(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 33
                && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Sin permiso de notificaciones");
            return;
        }
        String title = call.getString("title", "Zona azul");
        String text = call.getString("text", "");
        Double end = call.getDouble("end");
        Double lat = call.getDouble("lat");
        Double lon = call.getDouble("lon");
        String carLabel = call.getString("carLabel", "Volver al coche");
        if (end == null) {
            call.reject("Falta la hora de fin");
            return;
        }

        NotificationManager nm = manager();
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, call.getString("channel", "Ticket en marcha"),
                    NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
            b = new Notification.Builder(ctx, CHANNEL);
        } else {
            b = new Notification.Builder(ctx);
        }

        int icon = ctx.getResources().getIdentifier("ic_stat_avz", "drawable", ctx.getPackageName());
        if (icon == 0) icon = ctx.getApplicationInfo().icon;

        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        b.setSmallIcon(icon)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(true)
                .setWhen(end.longValue())
                .setUsesChronometer(true)
                .setColor(0xFF1659CC);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.setChronometerCountDown(true);
        if (open != null) b.setContentIntent(PendingIntent.getActivity(ctx, 1, open, flags));

        if (lat != null && lon != null) {
            Uri maps = Uri.parse("https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=" + lat + "," + lon);
            Intent go = new Intent(Intent.ACTION_VIEW, maps);
            go.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(ctx, 2, go, flags);
            b.addAction(new Notification.Action.Builder(null, carLabel, pi).build());
        }

        nm.notify(ID, b.build());
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        manager().cancel(ID);
        call.resolve();
    }
}
