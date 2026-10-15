package io.frappe.photos;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;
import org.json.JSONArray;

public class BackupWorker extends Worker {
    private static final String CHANNEL = "photos_backup";
    private static final int NOTIFICATION_ID = 4120;
    private static final int BATCH = 25;
    static volatile boolean running;
    private static final ReentrantLock LOCK = new ReentrantLock();
    private String skipped;

    private final BackupStore store;
    private final BackupClient client;

    public BackupWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
        store = new BackupStore(context);
        client = new BackupClient(store);
    }

    static final class Item {
        final Uri uri;
        final String key, name, mime;
        final long size, modified;
        Item(Uri uri, String key, String name, String mime, long size, long modified) {
            this.uri = uri; this.key = key; this.name = name; this.mime = mime; this.size = size; this.modified = modified;
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        if (!store.signedIn()) return Result.success();
        if (!LOCK.tryLock()) return Result.retry();
        skipped = null;
        running = true;
        PhotosBackupPlugin.emit(getApplicationContext());
        try {
            String folder = client.uploadFolder();
            uploadShared(folder);
            if (store.enabled() && hasPermission(getApplicationContext())) backupGallery(folder);
            store.finished(skipped);
            return Result.success();
        } catch (BackupClient.SignedOut e) {
            store.finished(e.getMessage());
            return Result.success();
        } catch (IOException | RuntimeException e) {
            store.finished(e.getMessage());
            return isStopped() ? Result.success() : Result.retry();
        } finally {
            running = false;
            LOCK.unlock();
            PhotosBackupPlugin.emit(getApplicationContext());
            BackupScheduler.watch(getApplicationContext());
        }
    }

    private void uploadShared(String folder) throws IOException {
        for (File file : SharedItems.list(getApplicationContext())) {
            if (isStopped()) return;
            String name = SharedItems.originalName(file);
            String mime = mimeOf(name);
            String sha1 = sha1(new FileInputStream(file));
            JSONArray missing = client.missing(new JSONArray().put(sha1));
            if (missing != null && missing.length() > 0) {
                try {
                    String uploaded = client.upload(folder, name, mime, file.length(), file.lastModified(), (offset, length) -> readFile(file, offset, length));
                    client.mark(uploaded, sha1);
                } catch (BackupClient.Rejected e) {
                    skipped = name + ": " + e.getMessage();
                }
            }
            file.delete();
        }
    }

    private void backupGallery(String folder) throws IOException {
        List<Item> items = new ArrayList<>(query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image"));
        if (store.includeVideos()) items.addAll(query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video"));
        items.sort((a, b) -> Long.compare(b.modified, a.modified));
        List<Item> pending = new ArrayList<>();
        for (Item item : items) if (!store.isDone(item.key)) pending.add(item);
        int done = items.size() - pending.size();
        store.progress(items.size(), done);
        PhotosBackupPlugin.emit(getApplicationContext());
        if (pending.size() > 50) setForegroundAsync(foregroundInfo(done, items.size()));

        for (int start = 0; start < pending.size(); start += BATCH) {
            if (isStopped()) return;
            List<Item> batch = pending.subList(start, Math.min(pending.size(), start + BATCH));
            List<String> hashes = new ArrayList<>();
            JSONArray request = new JSONArray();
            for (Item item : batch) {
                String hash = hashOf(item);
                hashes.add(hash);
                if (hash != null) request.put(hash);
            }
            JSONArray missing = request.length() > 0 ? client.missing(request) : new JSONArray();
            List<String> wanted = new ArrayList<>();
            for (int i = 0; missing != null && i < missing.length(); i++) wanted.add(missing.optString(i));
            for (int i = 0; i < batch.size(); i++) {
                if (isStopped()) return;
                Item item = batch.get(i);
                String hash = hashes.get(i);
                if (hash == null) continue;
                if (wanted.contains(hash)) {
                    try {
                        String uploaded = client.upload(folder, item.name, item.mime, item.size, item.modified, (offset, length) -> readUri(item.uri, offset, length));
                        client.mark(uploaded, hash);
                    } catch (BackupClient.Rejected e) {
                        skipped = item.name + ": " + e.getMessage();
                        continue;
                    }
                }
                store.markDone(item.key, hash);
                store.progress(items.size(), ++done);
                PhotosBackupPlugin.emit(getApplicationContext());
                if (pending.size() > 50) setForegroundAsync(foregroundInfo(done, items.size()));
            }
        }
    }

    private List<Item> query(Uri collection, String kind) { return query(getApplicationContext(), collection, kind); }

    static List<Item> query(Context context, Uri collection, String kind) {
        List<Item> items = new ArrayList<>();
        String[] columns = {
            MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED, MediaStore.MediaColumns.DATE_TAKEN,
        };
        ContentResolver resolver = context.getContentResolver();
        try (Cursor cursor = resolver.query(collection, columns, null, null, null)) {
            if (cursor == null) return items;
            while (cursor.moveToNext()) {
                long id = cursor.getLong(0);
                long size = cursor.getLong(3);
                if (size <= 0) continue;
                long modified = cursor.getLong(4);
                long taken = cursor.getLong(5);
                String name = cursor.getString(1);
                String mime = cursor.getString(2);
                items.add(new Item(ContentUris.withAppendedId(collection, id), kind + ":" + id + ":" + size + ":" + modified,
                    name == null ? kind + "-" + id : name, mime == null ? "application/octet-stream" : mime, size,
                    taken > 0 ? taken : modified * 1000));
            }
        }
        return items;
    }

    private String hashOf(Item item) { return hashOf(getApplicationContext(), item); }

    static String hashOf(Context context, Item item) {
        try {
            InputStream in = context.getContentResolver().openInputStream(item.uri);
            return in == null ? null : sha1(in);
        } catch (IOException | SecurityException e) {
            return null;
        }
    }

    static String sha1(InputStream in) throws IOException {
        try (InputStream stream = in) {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] buffer = new byte[256 * 1024];
            int read;
            while ((read = stream.read(buffer)) > 0) digest.update(buffer, 0, read);
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }

    private byte[] readUri(Uri uri, long offset, int length) throws IOException {
        try (ParcelFileDescriptor descriptor = getApplicationContext().getContentResolver().openFileDescriptor(uri, "r")) {
            if (descriptor == null) throw new IOException("The photo could not be read");
            return readChannel(new FileInputStream(descriptor.getFileDescriptor()).getChannel(), offset, length);
        }
    }

    private static byte[] readFile(File file, long offset, int length) throws IOException {
        try (FileInputStream in = new FileInputStream(file)) {
            return readChannel(in.getChannel(), offset, length);
        }
    }

    private static byte[] readChannel(FileChannel channel, long offset, int length) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(length);
        channel.position(offset);
        while (buffer.hasRemaining()) if (channel.read(buffer) < 0) break;
        return buffer.array();
    }

    static boolean hasPermission(Context context) {
        if (Build.VERSION.SDK_INT >= 34 && granted(context, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)) return true;
        if (Build.VERSION.SDK_INT >= 33) return granted(context, Manifest.permission.READ_MEDIA_IMAGES);
        return granted(context, Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    private static boolean granted(Context context, String permission) {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private static String mimeOf(String name) {
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        String mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return mime == null ? "application/octet-stream" : mime;
    }

    static PendingIntent openBackup(Context context) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("io.frappe.photos://open/settings/backup"), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @NonNull
    @Override
    public ForegroundInfo getForegroundInfo() { return foregroundInfo(store.done(), store.total()); }

    private ForegroundInfo foregroundInfo(int done, int total) {
        Context context = getApplicationContext();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, context.getString(R.string.backup_channel), NotificationManager.IMPORTANCE_LOW));
        }
        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_backup)
            .setContentTitle(context.getString(R.string.backup_running))
            .setContentText(context.getString(R.string.backup_progress, done, total))
            .setProgress(Math.max(total, 1), done, total == 0)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(openBackup(context))
            .build();
        if (Build.VERSION.SDK_INT >= 29) return new ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        return new ForegroundInfo(NOTIFICATION_ID, notification);
    }
}
