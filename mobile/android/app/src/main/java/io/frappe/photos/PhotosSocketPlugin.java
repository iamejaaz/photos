package io.frappe.photos;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.socket.client.IO;
import io.socket.client.Socket;
import java.net.URI;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@CapacitorPlugin(name = "PhotosSocket")
public class PhotosSocketPlugin extends Plugin {
    private Socket socket;
    private IO.Options options;
    private String origin = "";
    private String siteName = "";
    private String connectedTarget = "";
    private boolean hasConnected = false;

    @PluginMethod
    public void connect(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url required");
            return;
        }
        String target = url + "/" + call.getString("namespace", "") + "@" + call.getString("origin", "");
        if (socket != null && target.equals(connectedTarget)) {
            options.extraHeaders = headers(call.getString("token", ""));
            if (socket.connected()) notifyListeners("connect", new JSObject());
            else { socket.disconnect(); socket.connect(); }
            call.resolve();
            return;
        }
        close();
        connectedTarget = target;
        hasConnected = false;
        origin = call.getString("origin", "");
        siteName = call.getString("namespace", "");
        options = new IO.Options();
        options.transports = new String[] { "websocket" };
        options.extraHeaders = headers(call.getString("token", ""));
        socket = IO.socket(URI.create(url + "/" + siteName), options);
        socket.on(Socket.EVENT_CONNECT, args -> {
            notifyListeners("connect", new JSObject());
            if (hasConnected) notifyListeners("reconnect", new JSObject());
            hasConnected = true;
        });
        socket.on(Socket.EVENT_DISCONNECT, args -> notifyListeners("disconnect", new JSObject().put("reason", args.length > 0 ? String.valueOf(args[0]) : "")));
        socket.on(Socket.EVENT_CONNECT_ERROR, args -> {
            String message = args.length > 0 ? String.valueOf(args[0]) : "";
            Logger.warn("PhotosSocket: connect error: " + message);
            notifyListeners("connect_error", new JSObject().put("message", message));
        });
        socket.onAnyIncoming(args -> {
            JSObject payload = new JSObject();
            payload.put("event", String.valueOf(args[0]));
            payload.put("args", new JSArray(Arrays.asList(args).subList(1, args.length)));
            notifyListeners("event", payload);
        });
        socket.connect();
        call.resolve();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        close();
        call.resolve();
    }

    @PluginMethod
    public void emit(PluginCall call) {
        String event = call.getString("event");
        JSArray args = call.getArray("args", new JSArray());
        if (socket != null && event != null) {
            Object[] items = new Object[args.length()];
            for (int i = 0; i < items.length; i++) items[i] = args.opt(i);
            socket.emit(event, items);
        }
        call.resolve();
    }
    @PluginMethod
    public void setToken(PluginCall call) {
        if (options != null) options.extraHeaders = headers(call.getString("token", ""));
        call.resolve();
    }

    private Map<String, List<String>> headers(String token) {
        Map<String, List<String>> headers = new HashMap<>();
        headers.put("Origin", Collections.singletonList(origin));
        headers.put("Authorization", Collections.singletonList("Bearer " + token));
        headers.put("X-Frappe-Site-Name", Collections.singletonList(siteName));
        return headers;
    }

    private void close() {
        connectedTarget = "";
        if (socket == null) return;
        socket.off();
        socket.disconnect();
        socket = null;
    }
}
