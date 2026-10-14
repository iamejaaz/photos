package io.frappe.photos;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "PhotosBackup",
    permissions = {
        @Permission(alias = "media", strings = {Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO}),
        @Permission(alias = "mediaSelected", strings = {Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED}),
        @Permission(alias = "mediaLegacy", strings = {Manifest.permission.READ_EXTERNAL_STORAGE}),
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}),
    }
)
public class PhotosBackupPlugin extends Plugin {
    private static WeakReference<PhotosBackupPlugin> instance = new WeakReference<>(null);
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    public void load() { instance = new WeakReference<>(this); }

    static void emit(Context context) {
        PhotosBackupPlugin plugin = instance.get();
        if (plugin != null) plugin.notifyListeners("status", status(context));
    }

    static JSObject status(Context context) {
        BackupStore store = new BackupStore(context);
        JSObject status = new JSObject();
        status.put("enabled", store.enabled());
        status.put("wifiOnly", store.wifiOnly());
        status.put("includeVideos", store.includeVideos());
        status.put("permission", permission(context));
        status.put("running", BackupWorker.running);
        status.put("total", store.total());
        status.put("done", store.done());
        status.put("lastRun", store.lastRun() > 0 ? store.lastRun() : null);
        status.put("lastError", store.lastError().isEmpty() ? null : store.lastError());
        status.put("signedIn", store.signedIn());
        status.put("site", store.site());
        status.put("user", store.user());
        return status;
    }

    private static String permission(Context context) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (granted(context, Manifest.permission.READ_MEDIA_IMAGES)) return "granted";
            if (Build.VERSION.SDK_INT >= 34 && granted(context, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)) return "partial";
            return "prompt";
        }
        return granted(context, Manifest.permission.READ_EXTERNAL_STORAGE) ? "granted" : "prompt";
    }

    private static boolean granted(Context context, String permission) {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        String site = call.getString("site", "");
        String clientId = call.getString("clientId", "");
        String accessToken = call.getString("accessToken", "");
        String refreshToken = call.getString("refreshToken", "");
        if (site.isEmpty() || clientId.isEmpty() || refreshToken.isEmpty()) {
            call.reject("site, clientId and refreshToken are required");
            return;
        }
        new BackupStore(getContext()).signIn(site, call.getString("user", ""), clientId, accessToken, refreshToken, call.getInt("expiresIn", 3600));
        BackupScheduler.schedule(getContext());
        call.resolve(status(getContext()));
    }

    @PluginMethod
    public void getStatus(PluginCall call) { call.resolve(status(getContext())); }

    @PluginMethod
    public void setOptions(PluginCall call) {
        new BackupStore(getContext()).setOptions(call.getBoolean("enabled"), call.getBoolean("wifiOnly"), call.getBoolean("includeVideos"));
        BackupScheduler.schedule(getContext());
        call.resolve(status(getContext()));
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        String[] aliases;
        if (Build.VERSION.SDK_INT >= 34) aliases = new String[]{"media", "mediaSelected", "notifications"};
        else if (Build.VERSION.SDK_INT >= 33) aliases = new String[]{"media", "notifications"};
        else aliases = new String[]{"mediaLegacy"};
        requestPermissionForAliases(aliases, call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        BackupScheduler.schedule(getContext());
        call.resolve(status(getContext()));
    }

    @PluginMethod
    public void runNow(PluginCall call) {
        BackupScheduler.runNow(getContext());
        call.resolve();
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        BackupStore store = new BackupStore(getContext());
        String site = store.site();
        String token = store.refreshToken();
        String clientId = store.clientId();
        store.signOut();
        BackupScheduler.schedule(getContext());
        if (!site.isEmpty() && !token.isEmpty()) new Thread(() -> BackupClient.revoke(site, clientId, token)).start();
        call.resolve();
    }

    @PluginMethod
    public void saveToDevice(PluginCall call) {
        String url = call.getString("url", "");
        String name = call.getString("name", "download");
        JSObject headers = call.getObject("headers", new JSObject());
        if (Build.VERSION.SDK_INT < 29) {
            call.reject("Saving needs Android 10 or later");
            return;
        }
        io.execute(() -> {
            try {
                save(url, name, headers);
                call.resolve();
            } catch (IOException | RuntimeException e) {
                call.reject(e.getMessage() == null ? "Could not save" : e.getMessage());
            }
        });
    }

    private void save(String url, String name, JSONObject headers) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(120_000);
        for (Iterator<String> keys = headers.keys(); keys.hasNext(); ) {
            String key = keys.next();
            connection.setRequestProperty(key, headers.optString(key));
        }
        int status = connection.getResponseCode();
        if (status >= 400) throw new IOException("The site answered " + status);
        String type = connection.getContentType();
        String mime = type == null ? "application/octet-stream" : type.split(";")[0].trim();
        Uri collection;
        String folder;
        if (mime.startsWith("image/")) {
            collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            folder = Environment.DIRECTORY_PICTURES + "/Photos";
        } else if (mime.startsWith("video/")) {
            collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
            folder = Environment.DIRECTORY_MOVIES + "/Photos";
        } else {
            collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            folder = Environment.DIRECTORY_DOWNLOADS;
        }
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, folder);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri item = resolver.insert(collection, values);
        if (item == null) throw new IOException("Could not create the file");
        try (InputStream in = connection.getInputStream(); OutputStream out = resolver.openOutputStream(item)) {
            if (out == null) throw new IOException("Could not write the file");
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
        } catch (IOException e) {
            resolver.delete(item, null, null);
            throw e;
        } finally {
            connection.disconnect();
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(item, values, null, null);
    }
}
