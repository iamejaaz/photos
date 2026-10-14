package io.frappe.photos;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "PhotosMedia")
public class PhotosMediaPlugin extends Plugin {
    @PluginMethod
    public void setSession(PluginCall call) {
        PhotosMediaHandler.origin = call.getString("origin", "");
        PhotosMediaHandler.token = call.getString("token", "");
        call.resolve();
    }

    @PluginMethod
    public void trim(PluginCall call) {
        Object rawBudget = call.getData().opt("budgetBytes");
        long budget = rawBudget instanceof Number ? ((Number) rawBudget).longValue() : Long.MAX_VALUE;
        File media = new File(getContext().getCacheDir(), "media");
        File[] folders = media.listFiles();
        if (folders == null) { call.resolve(); return; }
        long total = 0;
        List<File> others = new ArrayList<>();
        for (File folder : folders) {
            total += size(folder);
            others.add(folder);
        }
        others.sort((a, b) -> Long.compare(a.lastModified(), b.lastModified()));
        for (File folder : others) {
            if (total <= budget) break;
            total -= size(folder);
            delete(folder);
        }
        call.resolve();
    }

    private static long size(File file) {
        if (!file.isDirectory()) return file.length();
        long total = 0;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) total += size(child);
        return total;
    }

    private static void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }
}
