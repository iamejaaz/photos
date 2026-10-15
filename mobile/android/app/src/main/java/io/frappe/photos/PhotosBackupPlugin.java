package io.frappe.photos;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.app.Activity;
import android.app.PendingIntent;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
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
    private final List<Uri> freeable = new ArrayList<>();
    private long freeableBytes;
    private ActivityResultLauncher<IntentSenderRequest> deleteLauncher;
    private PluginCall deleteCall;

    @Override
    public void load() {
        instance = new WeakReference<>(this);
        ConnectivityManager connectivity = getContext().getSystemService(ConnectivityManager.class);
        connectivity.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback() {
            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) { emit(getContext()); }

            @Override
            public void onLost(Network network) { emit(getContext()); }
        });
        deleteLauncher = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall call = deleteCall;
            deleteCall = null;
            if (call == null) return;
            JSObject freed = new JSObject();
            boolean ok = result.getResultCode() == Activity.RESULT_OK;
            freed.put("count", ok ? freeable.size() : 0);
            freed.put("bytes", ok ? freeableBytes : 0);
            if (ok) {
                freeable.clear();
                freeableBytes = 0;
            }
            call.resolve(freed);
        });
    }

    static void emit(Context context) {
        PhotosBackupPlugin plugin = instance.get();
        if (plugin != null) plugin.notifyListeners("status", status(context));
    }

    static JSObject status(Context context) {
        BackupStore store = new BackupStore(context);
        JSObject status = new JSObject();
        status.put("enabled", store.enabled());
        status.put("wifiOnly", store.wifiOnly());
        status.put("network", network(context));
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

    private static String network(Context context) {
        ConnectivityManager connectivity = context.getSystemService(ConnectivityManager.class);
        NetworkCapabilities capabilities = connectivity.getNetworkCapabilities(connectivity.getActiveNetwork());
        if (capabilities == null || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return "none";
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) ? "wifi" : "mobile";
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
        BackupScheduler.runNow(getContext(), true);
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
    public void findFreeable(PluginCall call) {
        BackupStore store = new BackupStore(getContext());
        if (!store.signedIn() || !BackupWorker.hasPermission(getContext())) {
            call.reject("Backup is not set up on this phone");
            return;
        }
        io.execute(() -> {
            try {
                List<BackupWorker.Item> items = new ArrayList<>(BackupWorker.query(getContext(), MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image"));
                items.addAll(BackupWorker.query(getContext(), MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video"));
                List<BackupWorker.Item> backedUp = new ArrayList<>();
                List<String> hashes = new ArrayList<>();
                for (BackupWorker.Item item : items) {
                    if (!store.isDone(item.key)) continue;
                    String hash = store.hashOf(item.key);
                    if (hash == null) {
                        hash = BackupWorker.hashOf(getContext(), item);
                        if (hash == null) continue;
                        store.markDone(item.key, hash);
                    }
                    backedUp.add(item);
                    hashes.add(hash);
                }
                BackupClient client = new BackupClient(store);
                Set<String> missing = new HashSet<>();
                for (int start = 0; start < hashes.size(); start += 500) {
                    JSONArray batch = new JSONArray(hashes.subList(start, Math.min(hashes.size(), start + 500)));
                    JSONArray answer = client.missing(batch);
                    for (int i = 0; answer != null && i < answer.length(); i++) missing.add(answer.optString(i));
                }
                synchronized (freeable) {
                    freeable.clear();
                    freeableBytes = 0;
                    for (int i = 0; i < backedUp.size(); i++) {
                        if (missing.contains(hashes.get(i))) continue;
                        freeable.add(backedUp.get(i).uri);
                        freeableBytes += backedUp.get(i).size;
                    }
                }
                JSObject result = new JSObject();
                result.put("count", freeable.size());
                result.put("bytes", freeableBytes);
                call.resolve(result);
            } catch (IOException | RuntimeException e) {
                call.reject(e.getMessage() == null ? "Could not check the backup" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void freeUpSpace(PluginCall call) {
        if (Build.VERSION.SDK_INT < 30) {
            call.reject("Freeing up space needs Android 11 or later");
            return;
        }
        if (freeable.isEmpty()) {
            JSObject none = new JSObject();
            none.put("count", 0);
            none.put("bytes", 0);
            call.resolve(none);
            return;
        }
        PendingIntent request = MediaStore.createDeleteRequest(getContext().getContentResolver(), new ArrayList<>(freeable));
        deleteCall = call;
        deleteLauncher.launch(new IntentSenderRequest.Builder(request.getIntentSender()).build());
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

    @PluginMethod
    public void shareFiles(PluginCall call) {
        JSArray files = call.getArray("files", new JSArray());
        JSObject headers = call.getObject("headers", new JSObject());
        io.execute(() -> {
            try {
                File folder = new File(getContext().getCacheDir(), "share");
                deleteChildren(folder);
                folder.mkdirs();
                ArrayList<Uri> uris = new ArrayList<>();
                String common = null;
                for (int i = 0; i < files.length(); i++) {
                    JSONObject file = files.getJSONObject(i);
                    String name = file.optString("name", "photo").replaceAll("[/\\\\]", "_");
                    File target = new File(folder, i + "-" + name);
                    String mime = download(file.getString("url"), headers, target);
                    uris.add(FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", target));
                    String kind = mime.contains("/") ? mime.substring(0, mime.indexOf('/')) + "/*" : "*/*";
                    common = common == null || common.equals(kind) ? kind : "*/*";
                }
                if (uris.isEmpty()) {
                    call.reject("Nothing to share");
                    return;
                }
                Intent send = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
                send.setType(common == null ? "*/*" : common);
                if (uris.size() == 1) send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
                else send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, null);
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().runOnUiThread(() -> {
                    getActivity().startActivity(chooser);
                    call.resolve();
                });
            } catch (IOException | JSONException | RuntimeException e) {
                call.reject(e.getMessage() == null ? "Could not share" : e.getMessage());
            }
        });
    }

    private String download(String url, JSONObject headers, File target) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(120_000);
        for (Iterator<String> keys = headers.keys(); keys.hasNext(); ) {
            String key = keys.next();
            connection.setRequestProperty(key, headers.optString(key));
        }
        try {
            int status = connection.getResponseCode();
            if (status >= 400) throw new IOException("The site answered " + status);
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
            }
            String type = connection.getContentType();
            return type == null ? "application/octet-stream" : type.split(";")[0].trim();
        } finally {
            connection.disconnect();
        }
    }

    private static void deleteChildren(File folder) {
        File[] children = folder.listFiles();
        if (children != null) for (File child : children) child.delete();
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
