package io.frappe.photos;

import android.content.Context;
import android.os.Build;
import android.provider.MediaStore;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

final class BackupScheduler {
    static final String PERIODIC = "photos-backup-periodic";
    static final String NOW = "photos-backup-now";
    static final String WATCH = "photos-backup-watch";
    static final String SOON = "photos-backup-soon";
    private static final long RETRY_SECONDS = 30;

    static void schedule(Context context) {
        BackupStore store = new BackupStore(context);
        WorkManager work = WorkManager.getInstance(context);
        if (!store.signedIn() || !store.enabled()) {
            work.cancelUniqueWork(PERIODIC);
            work.cancelUniqueWork(WATCH);
            work.cancelUniqueWork(SOON);
            if (SharedItems.pending(context)) runNow(context);
            return;
        }
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(BackupWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(network(store))
            .build();
        work.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, periodic);
        watch(context);
        runNow(context);
    }

    static void runNow(Context context) { runNow(context, false); }

    static void runNow(Context context, boolean anyNetwork) {
        BackupStore store = new BackupStore(context);
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BackupWorker.class)
            .setConstraints(anyNetwork ? new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build() : network(store))
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.APPEND_OR_REPLACE, request);
    }

    static void runSoon(Context context) {
        BackupStore store = new BackupStore(context);
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BackupWorker.class)
            .setConstraints(network(store))
            .setInitialDelay(RETRY_SECONDS, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(SOON, ExistingWorkPolicy.APPEND_OR_REPLACE, request);
    }

    static void watch(Context context) {
        BackupStore store = new BackupStore(context);
        if (!store.signedIn() || !store.enabled()) return;
        Constraints.Builder constraints = new Constraints.Builder()
            .setRequiredNetworkType(store.wifiOnly() ? NetworkType.UNMETERED : NetworkType.CONNECTED)
            .addContentUriTrigger(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true)
            .setTriggerContentUpdateDelay(10, TimeUnit.SECONDS)
            .setTriggerContentMaxDelay(2, TimeUnit.MINUTES);
        if (store.includeVideos()) constraints.addContentUriTrigger(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true);
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BackupWorker.class).setConstraints(constraints.build()).build();
        WorkManager.getInstance(context).enqueueUniqueWork(WATCH, ExistingWorkPolicy.REPLACE, request);
    }

    private static Constraints network(BackupStore store) {
        return new Constraints.Builder()
            .setRequiredNetworkType(store.wifiOnly() ? NetworkType.UNMETERED : NetworkType.CONNECTED)
            .build();
    }

    private BackupScheduler() {}
}
