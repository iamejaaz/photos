package io.frappe.photos;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    private static final ExecutorService SHARES = Executors.newSingleThreadExecutor();
    private ScriptHandler insetScript;
    private Insets lastBars;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhotosShellPlugin.class);
        registerPlugin(PhotosMediaPlugin.class);
        registerPlugin(PhotosBackupPlugin.class);
        registerPlugin(PhotosSocketPlugin.class);
        Intent launch = getIntent();
        boolean fromHistory = launch != null && (launch.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
        if (savedInstanceState == null && !fromHistory) receiveShare(launch);
        super.onCreate(savedInstanceState);
        serveMediaProxy();
        publishSystemBarInsets();
        BackupScheduler.schedule(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        receiveShare(intent);
    }

    private void receiveShare(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        }
        if (uris.isEmpty()) return;
        if (!new BackupStore(this).signedIn()) {
            Toast.makeText(this, R.string.share_sign_in_first, Toast.LENGTH_LONG).show();
            return;
        }
        setIntent(new Intent());
        SHARES.execute(() -> {
            int queued = SharedItems.copy(this, uris);
            if (queued == 0) return;
            BackupScheduler.runNow(this);
            runOnUiThread(() -> Toast.makeText(this, getResources().getQuantityString(R.plurals.share_queued, queued, queued), Toast.LENGTH_SHORT).show());
        });
    }

    private void serveMediaProxy() {
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse media = PhotosMediaHandler.handle(getApplicationContext(), request);
                return media != null ? media : super.shouldInterceptRequest(view, request);
            }
        });
    }

    private void publishSystemBarInsets() {
        View host = (View) getBridge().getWebView().getParent();
        int bars = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
        ViewCompat.setOnApplyWindowInsetsListener(host, (v, insets) -> {
            Insets bar = insets.getInsets(bars);
            WindowInsetsCompat consumed = new WindowInsetsCompat.Builder(insets).setInsets(bars, Insets.NONE).build();
            if (bar.equals(lastBars)) return consumed;
            lastBars = bar;
            float density = getResources().getDisplayMetrics().density;
            String script = String.format(Locale.ROOT,
                "(function apply(){var e=document.documentElement;if(e){e.style.cssText+=';--inset-top:%.1fpx;--inset-bottom:%.1fpx;--inset-left:%.1fpx;--inset-right:%.1fpx;'}else{document.addEventListener('readystatechange',apply,{once:true})}})()",
                bar.top / density, bar.bottom / density, bar.left / density, bar.right / density);
            WebView webView = getBridge().getWebView();
            if (insetScript != null) insetScript.remove();
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                String origin = getBridge().getScheme() + "://" + getBridge().getHost();
                insetScript = WebViewCompat.addDocumentStartJavaScript(webView, script, Collections.singleton(origin));
            }
            webView.evaluateJavascript(script, null);
            return consumed;
        });
    }
}
