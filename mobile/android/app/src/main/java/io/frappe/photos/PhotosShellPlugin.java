package io.frappe.photos;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PhotosShell")
public class PhotosShellPlugin extends Plugin {
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_WEAK
        | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    private SharedPreferences lockedPrefs() throws Exception {
        Context context = getContext();
        return EncryptedSharedPreferences.create("photos-locked", MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    @PluginMethod
    public void deviceUnlockStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS);
        try {
            result.put("saved", lockedPrefs().contains(call.getString("key", "")));
        } catch (Exception e) {
            result.put("saved", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void saveUnlockSecret(PluginCall call) {
        try {
            lockedPrefs().edit().putString(call.getString("key", ""), call.getString("secret", "")).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not save on this phone");
        }
    }

    @PluginMethod
    public void forgetUnlockSecret(PluginCall call) {
        try {
            lockedPrefs().edit().remove(call.getString("key", "")).apply();
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    @PluginMethod
    public void readUnlockSecret(PluginCall call) {
        String key = call.getString("key", "");
        String secret;
        try {
            secret = lockedPrefs().getString(key, null);
        } catch (Exception e) {
            secret = null;
        }
        if (secret == null) {
            call.reject("Not set up on this phone");
            return;
        }
        String value = secret;
        FragmentActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    JSObject data = new JSObject();
                    data.put("secret", value);
                    call.resolve(data);
                }

                @Override
                public void onAuthenticationError(int code, CharSequence message) {
                    JSObject data = new JSObject();
                    data.put("cancelled", true);
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
