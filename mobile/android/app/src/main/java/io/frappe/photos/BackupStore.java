package io.frappe.photos;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;

final class BackupStore {
    private static final String PREFS = "photos_backup";
    private static Database database;
    private final SharedPreferences prefs;
    private final Context context;

    BackupStore(Context context) {
        this.context = context.getApplicationContext();
        this.prefs = open(this.context);
    }

    private static SharedPreferences open(Context context) {
        try {
            String key = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC);
            return EncryptedSharedPreferences.create(PREFS, key, context,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
        } catch (Exception e) {
            throw new IllegalStateException("Secure storage is not available", e);
        }
    }

    boolean signedIn() { return !refreshToken().isEmpty() && !site().isEmpty(); }
    String site() { return prefs.getString("site", ""); }
    String user() { return prefs.getString("user", ""); }
    String clientId() { return prefs.getString("client_id", ""); }
    String accessToken() { return prefs.getString("access_token", ""); }
    String refreshToken() { return prefs.getString("refresh_token", ""); }
    long expiresAt() { return prefs.getLong("expires_at", 0); }
    boolean enabled() { return prefs.getBoolean("enabled", false); }
    boolean wifiOnly() { return prefs.getBoolean("wifi_only", true); }
    boolean includeVideos() { return prefs.getBoolean("include_videos", true); }
    long lastRun() { return prefs.getLong("last_run", 0); }
    String lastError() { return prefs.getString("last_error", ""); }
    int total() { return prefs.getInt("total", 0); }
    int done() { return prefs.getInt("done", 0); }

    void signIn(String site, String user, String clientId, String accessToken, String refreshToken, long expiresIn) {
        if (!site.equals(site()) || !user.equals(user())) clearDone();
        prefs.edit().putString("site", site).putString("user", user).putString("client_id", clientId).apply();
        saveTokens(accessToken, refreshToken, expiresIn);
    }

    void saveTokens(String accessToken, String refreshToken, long expiresIn) {
        prefs.edit()
            .putString("access_token", accessToken)
            .putString("refresh_token", refreshToken)
            .putLong("expires_at", System.currentTimeMillis() + expiresIn * 1000)
            .apply();
    }

    void signOut() {
        prefs.edit().remove("site").remove("user").remove("client_id").remove("access_token").remove("refresh_token")
            .remove("expires_at").putBoolean("enabled", false).putInt("total", 0).putInt("done", 0).apply();
        clearDone();
    }

    void setOptions(Boolean enabled, Boolean wifiOnly, Boolean includeVideos) {
        SharedPreferences.Editor editor = prefs.edit();
        if (enabled != null) editor.putBoolean("enabled", enabled);
        if (wifiOnly != null) editor.putBoolean("wifi_only", wifiOnly);
        if (includeVideos != null) editor.putBoolean("include_videos", includeVideos);
        editor.apply();
    }

    void progress(int total, int done) { prefs.edit().putInt("total", total).putInt("done", done).apply(); }

    void finished(String error) {
        prefs.edit().putLong("last_run", System.currentTimeMillis()).putString("last_error", error == null ? "" : error).apply();
    }

    private Database db() {
        synchronized (BackupStore.class) {
            if (database == null) database = new Database(context);
            return database;
        }
    }

    boolean isDone(String key) {
        try (Cursor cursor = db().getReadableDatabase().rawQuery("select 1 from done where key = ?", new String[]{key})) {
            return cursor.moveToFirst();
        }
    }

    void markDone(String key) {
        ContentValues values = new ContentValues();
        values.put("key", key);
        db().getWritableDatabase().insertWithOnConflict("done", null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }

    private void clearDone() { db().getWritableDatabase().delete("done", null, null); }

    private static final class Database extends SQLiteOpenHelper {
        Database(Context context) { super(context, "photos_backup.db", null, 1); }
        @Override public void onCreate(SQLiteDatabase db) { db.execSQL("create table done (key text primary key)"); }
        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}
    }
}
