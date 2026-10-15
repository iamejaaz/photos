package io.frappe.photos;

import android.content.Intent;
import android.net.Uri;
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
