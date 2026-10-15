package io.frappe.photos;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class BackupClient {
    static final class SignedOut extends IOException {
        SignedOut() { super("Sign in to Photos again to keep backing up"); }
    }

    static final class Rejected extends IOException {
        Rejected(String message) { super(message); }
    }

    static final class Refused extends IOException {
        Refused(String message) { super(message); }
    }

    static final class Dropped extends IOException {
        Dropped(IOException cause, String host) { super(reason(cause, host), cause); }
    }

    static final class ServerError extends IOException {
        final int status;
        ServerError(int status) { super("The site answered " + status); this.status = status; }
    }

    static String reason(IOException cause, String host) {
        if (cause instanceof ServerError) {
            int status = ((ServerError) cause).status;
            if (status == 503) return host + " is being updated. Backup continues when it is back.";
            if (status == 502 || status == 504) return host + " is not responding. Backup tries again in a minute.";
            return host + " ran into an error (" + status + "). Backup tries again in a minute.";
        }
        if (cause instanceof UnknownHostException) return "Can't find " + host + ". Check your internet connection.";
        if (cause instanceof SocketTimeoutException) return host + " took too long to answer. Backup tries again in a minute.";
        if (cause instanceof ConnectException) return "Can't connect to " + host + ". Backup tries again in a minute.";
        return "The connection to " + host + " dropped. Backup tries again in a minute.";
    }

    private static final int ATTEMPTS = 3;
    private static final long FIRST_PAUSE_MS = 2_000;

    interface Attempt<T> { T run(int tried) throws IOException; }

    <T> T retrying(Attempt<T> attempt) throws IOException {
        IOException last = null;
        for (int tried = 0; tried < ATTEMPTS; tried++) {
            try {
                return attempt.run(tried);
            } catch (SignedOut | Rejected | Refused e) {
                throw e;
            } catch (ServerError e) {
                if (e.status == 503) throw new Dropped(e, host());
                last = e;
                pause(tried);
            } catch (IOException e) {
                if (siteDown(e)) throw e;
                last = e;
                pause(tried);
            }
            if (Thread.currentThread().isInterrupted()) break;
        }
        throw new Dropped(last, host());
    }

    private static void pause(int tried) {
        try {
            Thread.sleep(FIRST_PAUSE_MS << tried);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    static boolean siteDown(IOException e) {
        return e.getCause() instanceof ServerError && ((ServerError) e.getCause()).status == 503;
    }

    private static final String TOKEN = "/api/method/frappe.integrations.oauth2.get_token";
    private final BackupStore store;

    BackupClient(BackupStore store) { this.store = store; }

    private String host() {
        try { return new URL(store.site()).getHost(); } catch (IOException e) { return "The site"; }
    }

    String uploadFolder() throws IOException {
        String folder = retrying(tried -> call("POST", "/api/method/photos.api.backup.upload_folder", "{}", "application/json")).optString("message", "");
        if (folder.isEmpty()) throw new IOException("The site has no Photos folder for this account");
        return folder;
    }

    JSONArray missing(JSONArray hashes) throws IOException {
        JSONObject body = new JSONObject();
        try { body.put("hashes", hashes); } catch (JSONException e) { throw new IOException(e); }
        return retrying(tried -> call("POST", "/api/method/photos.api.backup.missing", body.toString(), "application/json")).optJSONArray("message");
    }

    void mark(String file, String sha1) throws IOException {
        JSONObject body = new JSONObject();
        try { body.put("file", file); body.put("sha1", sha1); } catch (JSONException e) { throw new IOException(e); }
        retrying(tried -> call("POST", "/api/method/photos.api.backup.mark", body.toString(), "application/json"));
    }

    String upload(String parent, String name, String mime, long size, long modified, String sha1, ChunkSource source) throws IOException {
        return retrying(tried -> {
            if (tried > 0 && !isMissing(sha1)) return null;
            return uploadOnce(parent, name, mime, size, modified, source);
        });
    }

    private boolean isMissing(String sha1) throws IOException {
        JSONArray missing = missing(new JSONArray().put(sha1));
        return missing == null || missing.length() > 0;
    }

    private String uploadOnce(String parent, String name, String mime, long size, long modified, ChunkSource source) throws IOException {
        long chunkSize = 20L * 1024 * 1024;
        int total = (int) Math.max(1, (size + chunkSize - 1) / chunkSize);
        String uuid = UUID.randomUUID().toString();
        String result = null;
        for (int index = 0; index < total; index++) {
            long offset = index * chunkSize;
            byte[] chunk = source.read(offset, (int) Math.min(chunkSize, size - offset));
            Multipart form = new Multipart();
            form.field("parent", parent).field("uuid", uuid).field("total_file_size", String.valueOf(size))
                .field("file_modified", String.valueOf(modified)).field("chunk_index", String.valueOf(index))
                .field("total_chunk_count", String.valueOf(total)).field("chunk_byte_offset", String.valueOf(offset))
                .file("file", name, mime, chunk);
            JSONObject response = sendChunk(form);
            JSONObject message = response.optJSONObject("message");
            if (message != null) result = message.optString("name", result);
        }
        if (result == null) throw new IOException("Upload did not return a file");
        return result;
    }

    private static final String PHOTOS_UPLOAD = "/api/method/photos.api.backup.upload";
    private static final String DRIVE_UPLOAD = "/api/method/suite.drive.api.files.upload_file";
    private volatile boolean olderSite;

    private JSONObject sendChunk(Multipart form) throws IOException {
        if (!olderSite) {
            try {
                return call("POST", PHOTOS_UPLOAD, form.body(), form.contentType());
            } catch (Rejected e) {
                if (e.getMessage() == null || !e.getMessage().contains("has no attribute 'upload'")) throw e;
                olderSite = true;
            }
        }
        synchronized (DRIVE_UPLOAD) {
            return call("POST", DRIVE_UPLOAD, form.body(), form.contentType());
        }
    }

    interface ChunkSource { byte[] read(long offset, int length) throws IOException; }

    private JSONObject call(String method, String path, Object body, String contentType) throws IOException {
        ensureFresh();
        Response response = send(method, path, body, contentType);
        if (response.status == 401) {
            refresh();
            response = send(method, path, body, contentType);
        }
        if (response.status == 400 || response.status == 413 || response.status == 415 || response.status == 417) throw new Rejected(serverMessage(response));
        if (response.status >= 500) throw new ServerError(response.status);
        if (response.status >= 400) throw new Refused(serverMessage(response));
        try { return new JSONObject(response.body.isEmpty() ? "{}" : response.body); } catch (JSONException e) { throw new IOException(e); }
    }

    private Response send(String method, String path, Object body, String contentType) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(store.site() + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(120_000);
        connection.setRequestProperty("Authorization", "Bearer " + store.accessToken());
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Connection", "close");
        if (body != null) {
            byte[] bytes = body instanceof byte[] ? (byte[]) body : ((String) body).getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", contentType);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
        }
        return Response.read(connection);
    }

    private void ensureFresh() throws IOException {
        if (!store.signedIn()) throw new SignedOut();
        if (store.expiresAt() - System.currentTimeMillis() < 60_000) refreshIfExpiring();
    }

    private synchronized void refreshIfExpiring() throws IOException {
        if (store.expiresAt() - System.currentTimeMillis() < 60_000) refresh();
    }

    private synchronized void refresh() throws IOException {
        String form = "grant_type=refresh_token&refresh_token=" + encode(store.refreshToken()) + "&client_id=" + encode(store.clientId());
        HttpURLConnection connection = (HttpURLConnection) new URL(store.site() + TOKEN).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(30_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        try (OutputStream out = connection.getOutputStream()) { out.write(form.getBytes(StandardCharsets.UTF_8)); }
        Response response = Response.read(connection);
        if (response.status >= 500) throw new ServerError(response.status);
        try {
            JSONObject data = new JSONObject(response.body);
            if (response.status == 429) throw new IOException("The site is busy");
            if (response.status >= 400 || !data.has("access_token")) {
                store.signOut();
                throw new SignedOut();
            }
            store.saveTokens(data.getString("access_token"), data.optString("refresh_token", store.refreshToken()), data.optLong("expires_in", 3600));
        } catch (JSONException e) {
            throw new IOException("The site sent an unexpected answer");
        }
    }

    static void revoke(String site, String clientId, String refreshToken) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(site + "/api/method/frappe.integrations.oauth2.revoke_token").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(30_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            try (OutputStream out = connection.getOutputStream()) { out.write(("token=" + encode(refreshToken) + "&token_type_hint=refresh_token&client_id=" + encode(clientId)).getBytes(StandardCharsets.UTF_8)); }
            Response.read(connection);
        } catch (IOException ignored) {
        }
    }

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String serverMessage(Response response) {
        try {
            JSONObject data = new JSONObject(response.body);
            String messages = data.optString("_server_messages", "");
            if (!messages.isEmpty()) return new JSONObject(new JSONArray(messages).getString(0)).optString("message", "Upload failed");
            return data.optString("exception", "The site answered " + response.status);
        } catch (JSONException e) {
            return "The site answered " + response.status;
        }
    }

    private static final class Response {
        final int status;
        final String body;
        Response(int status, String body) { this.status = status; this.body = body; }
        static Response read(HttpURLConnection connection) throws IOException {
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (stream != null) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = stream.read(buffer)) > 0) out.write(buffer, 0, read);
                stream.close();
            }
            connection.disconnect();
            return new Response(status, out.toString(StandardCharsets.UTF_8.name()));
        }
    }

    private static final class Multipart {
        private final String boundary = "photos" + UUID.randomUUID().toString().replace("-", "");
        private final ByteArrayOutputStream out = new ByteArrayOutputStream();

        Multipart field(String name, String value) {
            write("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n");
            return this;
        }

        Multipart file(String name, String fileName, String mime, byte[] data) {
            write("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"; filename=\"" + fileName.replace("\"", "") + "\"\r\nContent-Type: " + mime + "\r\n\r\n");
            out.write(data, 0, data.length);
            write("\r\n");
            return this;
        }

        byte[] body() { write("--" + boundary + "--\r\n"); return out.toByteArray(); }
        String contentType() { return "multipart/form-data; boundary=" + boundary; }
        private void write(String text) { byte[] bytes = text.getBytes(StandardCharsets.UTF_8); out.write(bytes, 0, bytes.length); }
    }
}
