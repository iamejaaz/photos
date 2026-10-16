package io.frappe.photos;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.PixelCopy;
import android.view.View;
import android.view.Window;
import androidx.core.content.FileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PhotosShell")
public class PhotosShellPlugin extends Plugin {
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_WEAK
        | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void screenLockAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(result);
    }

    @PluginMethod
    public void confirmScreenLock(PluginCall call) {
        FragmentActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    JSObject data = new JSObject();
                    data.put("confirmed", true);
                    call.resolve(data);
                }

                @Override
                public void onAuthenticationError(int code, CharSequence message) {
                    JSObject data = new JSObject();
                    data.put("confirmed", false);
                    call.resolve(data);
                }
            });
            prompt.authenticate(new BiometricPrompt.PromptInfo.Builder()
                .setTitle(call.getString("title", "Unlock"))
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build());
        });
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        String url = call.getString("url");
        String redirect = call.getString("redirect");
        if (url == null || redirect == null) {
            call.reject("url and redirect are required");
            return;
        }
        getActivity().runOnUiThread(() -> AuthorizeSession.start(getActivity(), url, redirect, (callbackUrl) -> {
            JSObject result = new JSObject();
            if (callbackUrl == null) result.put("cancelled", true);
            else result.put("url", callbackUrl);
            call.resolve(result);
        }));
    }

    private static final int SCREENSHOT_SIDE = 1280;

    @PluginMethod
    public void captureScreen(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            View view = window.getDecorView();
            if (view.getWidth() == 0 || view.getHeight() == 0) {
                call.reject("Nothing to capture");
                return;
            }
            Bitmap bitmap = Bitmap.createBitmap(view.getWidth(), view.getHeight(), Bitmap.Config.ARGB_8888);
            if (Build.VERSION.SDK_INT >= 26) {
                PixelCopy.request(window, bitmap, result -> {
                    if (result == PixelCopy.SUCCESS) resolveScreenshot(call, bitmap);
                    else call.reject("Could not capture the screen");
                }, new Handler(Looper.getMainLooper()));
            } else {
                view.draw(new Canvas(bitmap));
                resolveScreenshot(call, bitmap);
            }
        });
    }

    private void resolveScreenshot(PluginCall call, Bitmap bitmap) {
        float scale = Math.min(1f, (float) SCREENSHOT_SIDE / Math.max(bitmap.getWidth(), bitmap.getHeight()));
        Bitmap scaled = scale < 1f
            ? Bitmap.createScaledBitmap(bitmap, Math.round(bitmap.getWidth() * scale), Math.round(bitmap.getHeight() * scale), true)
            : bitmap;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        scaled.compress(Bitmap.CompressFormat.JPEG, 75, out);
        JSObject result = new JSObject();
        result.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
        call.resolve(result);
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            call.reject("The update address is not valid");
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            JSObject result = new JSObject();
            result.put("needsPermission", true);
            call.resolve(result);
            return;
        }
        new Thread(() -> {
            try {
                File folder = new File(getContext().getCacheDir(), "updates");
                folder.mkdirs();
                File apk = new File(folder, "Photos.apk");
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(20_000);
                connection.setReadTimeout(60_000);
                if (connection.getResponseCode() != 200) throw new java.io.IOException("The update could not be downloaded");
                long total = connection.getContentLengthLong();
                long done = 0;
                int lastPercent = -1;
                try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[64 * 1024];
                    for (int read; (read = in.read(buffer)) > 0; ) {
                        out.write(buffer, 0, read);
                        done += read;
                        int percent = total > 0 ? (int) (done * 100 / total) : -1;
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject progress = new JSObject();
                            progress.put("percent", percent);
                            notifyListeners("updateProgress", progress);
                        }
                    }
                }
                if (total > 0 && done != total) throw new java.io.IOException("The download did not finish. Please try again.");
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "The update could not be downloaded" : e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            call.reject("Only web addresses open outside the app");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
