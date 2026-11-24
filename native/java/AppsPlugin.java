package net.danlab.avzonazul;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.text.Normalizer;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

/**
 * Busca las apps de pago instaladas en el móvil (por su nombre) y las abre.
 */
@CapacitorPlugin(name = "Apps")
public class AppsPlugin extends Plugin {

    private static String norm(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    /** apps: { id: ["nombre", "=nombre exacto", ...] }  ->  { found: { id: "paquete" } } */
    @PluginMethod
    public void installed(PluginCall call) {
        JSObject apps = call.getObject("apps", new JSObject());
        JSObject found = new JSObject();
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN);
            main.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
            Iterator<String> keys = apps.keys();
            while (keys.hasNext()) {
                String id = keys.next();
                JSONArray terms = apps.optJSONArray(id);
                if (terms == null) continue;
                outer:
                for (ResolveInfo ri : list) {
                    String label = norm(String.valueOf(ri.loadLabel(pm)));
                    for (int i = 0; i < terms.length(); i++) {
                        String t = terms.optString(i, "");
                        boolean exact = t.startsWith("=");
                        String nt = norm(exact ? t.substring(1) : t);
                        if (nt.isEmpty()) continue;
                        if (exact ? label.equals(nt) : label.contains(nt)) {
                            found.put(id, ri.activityInfo.packageName);
                            break outer;
                        }
                    }
                }
            }
        } catch (Exception ignored) { }
        JSObject ret = new JSObject();
        ret.put("found", found);
        call.resolve(ret);
    }

    /** packages: ["net.danlab.senda", ...]  ->  { installed: { paquete: true } } */
    @PluginMethod
    public void check(PluginCall call) {
        JSObject res = new JSObject();
        try {
            JSONArray pkgs = call.getArray("packages");
            PackageManager pm = getContext().getPackageManager();
            for (int i = 0; pkgs != null && i < pkgs.length(); i++) {
                String p = pkgs.optString(i, "");
                if (!p.isEmpty() && pm.getLaunchIntentForPackage(p) != null) res.put(p, true);
            }
        } catch (Exception ignored) { }
        JSObject ret = new JSObject();
        ret.put("installed", res);
        call.resolve(ret);
    }

    /** Abre el menú de compartir de Android con un enlace. */
    @PluginMethod
    public void share(PluginCall call) {
        String text = call.getString("text", "");
        String url = call.getString("url", "");
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT, call.getString("title", ""));
        send.putExtra(Intent.EXTRA_TEXT, text.isEmpty() ? url : text + "\n" + url);
        Intent chooser = Intent.createChooser(send, call.getString("title", ""));
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
        call.resolve();
    }

    @PluginMethod
    public void launch(PluginCall call) {
        String pkg = call.getString("package");
        Intent i = pkg == null ? null : getContext().getPackageManager().getLaunchIntentForPackage(pkg);
        if (i == null) {
            call.reject("No está instalada");
            return;
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
