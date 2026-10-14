package io.frappe.photos;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

final class SharedItems {
    static File folder(Context context) {
        File folder = new File(context.getFilesDir(), "shared");
        folder.mkdirs();
        return folder;
    }

    static int copy(Context context, List<Uri> uris) {
        int copied = 0;
        for (Uri uri : uris) {
            String type = context.getContentResolver().getType(uri);
            if (type == null || !(type.startsWith("image/") || type.startsWith("video/"))) continue;
            File target = new File(folder(context), UUID.randomUUID() + "__" + displayName(context, uri));
            File part = new File(target.getPath() + ".part");
            try (InputStream in = context.getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(part)) {
                if (in == null) continue;
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
            } catch (IOException | SecurityException e) {
                part.delete();
                continue;
            }
            if (part.renameTo(target)) copied++;
            else part.delete();
        }
        return copied;
    }

    static List<File> list(Context context) {
        File[] files = folder(context).listFiles();
        List<File> result = new ArrayList<>();
        if (files != null) for (File file : files) if (!file.getName().endsWith(".part")) result.add(file);
        return result;
    }

    static boolean pending(Context context) { return !list(context).isEmpty(); }

    static String originalName(File file) {
        String name = file.getName();
        int split = name.indexOf("__");
        return split >= 0 ? name.substring(split + 2) : name;
    }

    private static String displayName(Context context, Uri uri) {
        try (Cursor cursor = context.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name.replaceAll("[/\\\\]", "_");
            }
        } catch (RuntimeException ignored) {
        }
        return "shared-" + System.currentTimeMillis();
    }

    private SharedItems() {}
}
