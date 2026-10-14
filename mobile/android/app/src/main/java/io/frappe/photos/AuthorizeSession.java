package io.frappe.photos;

import android.app.Activity;
import android.app.Dialog;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

final class AuthorizeSession {

    interface Result {
        void onFinished(String callbackUrl);
    }

    static void start(Activity activity, String url, String redirect, Result result) {
        clearCookies();
        WebView web = new WebView(activity);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        Dialog dialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_NoActionBar);
        String[] callback = new String[1];
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String target = request.getUrl().toString();
                if (target.startsWith(redirect)) {
                    callback[0] = target;
                    dialog.dismiss();
                    return true;
                }
                String scheme = request.getUrl().getScheme();
                return !"https".equals(scheme) && !"http".equals(scheme);
            }
        });
        dialog.setContentView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        dialog.setOnDismissListener(d -> {
            web.destroy();
            clearCookies();
            result.onFinished(callback[0]);
        });
        dialog.show();
        web.loadUrl(url);
    }

    private static void clearCookies() {
        CookieManager cookies = CookieManager.getInstance();
        cookies.removeAllCookies(null);
        cookies.flush();
    }

    private AuthorizeSession() {}
}
