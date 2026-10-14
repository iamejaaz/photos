package io.frappe.photos;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PhotosShell")
public class PhotosShellPlugin extends Plugin {
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
