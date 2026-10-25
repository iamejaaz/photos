import Foundation

enum BackupError: LocalizedError {
    case signedOut
    case rejected(String)
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .signedOut: return "Sign in to Photos again to keep backing up"
        case .rejected(let message), .failed(let message): return message
        }
    }
}

final class BackupClient {
    private static let chunkSize = 20 * 1024 * 1024
    private let store: BackupStore
    private let session: URLSession

    init(store: BackupStore) {
        self.store = store
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 120
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        session = URLSession(configuration: configuration)
    }

    func uploadFolder() async throws -> String {
        let folder = try await call("/api/method/photos.api.backup.upload_folder", json: [:])["message"] as? String ?? ""
        if folder.isEmpty { throw BackupError.failed("The site has no Photos folder for this account") }
        return folder
    }

    func missing(_ hashes: [String]) async throws -> Set<String> {
        let result = try await call("/api/method/photos.api.backup.missing", json: ["hashes": hashes])
        return Set(result["message"] as? [String] ?? [])
    }

    func backedUp(_ files: [[Any]]) async throws -> [Int] {
        let result = try await call("/api/method/photos.api.backup.backed_up", json: ["files": files])
        return (result["message"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.intValue }
    }

    func mark(file: String, sha1: String) async throws {
        _ = try await call("/api/method/photos.api.backup.mark", json: ["file": file, "sha1": sha1])
    }

    func upload(folder: String, name: String, mime: String, file: URL, modified: Date) async throws -> String {
        let size = (try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue ?? 0
        let total = max(1, (size + Self.chunkSize - 1) / Self.chunkSize)
        let uuid = UUID().uuidString
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var result: String?
        for index in 0..<total {
            let offset = index * Self.chunkSize
            try handle.seek(toOffset: UInt64(offset))
            let chunk = handle.readData(ofLength: min(Self.chunkSize, size - offset))
            var form = Multipart()
            form.field("parent", folder)
            form.field("uuid", uuid)
            form.field("total_file_size", String(size))
            form.field("file_modified", String(Int64(modified.timeIntervalSince1970 * 1000)))
            form.field("chunk_index", String(index))
            form.field("total_chunk_count", String(total))
            form.field("chunk_byte_offset", String(offset))
            form.file("file", name: name, mime: mime, data: chunk)
            let response = try await call("/api/method/suite.drive.api.files.upload_file", body: form.body, contentType: form.contentType)
            if let message = response["message"] as? [String: Any], let name = message["name"] as? String { result = name }
        }
        guard let name = result else { throw BackupError.failed("Upload did not return a file") }
        return name
    }

    static func revoke(site: String, clientId: String, refreshToken: String) {
        guard let url = URL(string: site + "/api/method/frappe.integrations.oauth2.revoke_token") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = form(["token": refreshToken, "token_type_hint": "refresh_token", "client_id": clientId])
        URLSession.shared.dataTask(with: request).resume()
    }

    private func call(_ path: String, json: [String: Any]) async throws -> [String: Any] {
        try await call(path, body: try JSONSerialization.data(withJSONObject: json), contentType: "application/json")
    }

    private func call(_ path: String, body: Data, contentType: String) async throws -> [String: Any] {
        try await ensureFresh()
        var (status, data) = try await send(path, body: body, contentType: contentType)
        if status == 401 {
            try await refresh()
            (status, data) = try await send(path, body: body, contentType: contentType)
        }
        if [400, 413, 415, 417].contains(status) { throw BackupError.rejected(Self.serverMessage(data, status: status)) }
        if status >= 400 { throw BackupError.failed(Self.serverMessage(data, status: status)) }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    }

    private func send(_ path: String, body: Data, contentType: String) async throws -> (Int, Data) {
        guard let url = URL(string: store.site + path) else { throw BackupError.signedOut }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(store.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (data, response) = try await session.upload(for: request, from: body)
        return ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
    }

    private func ensureFresh() async throws {
        if !store.signedIn { throw BackupError.signedOut }
        if store.expiresAt.timeIntervalSinceNow < 60 { try await refresh() }
    }

    private func refresh() async throws {
        guard let url = URL(string: store.site + "/api/method/frappe.integrations.oauth2.get_token") else { throw BackupError.signedOut }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Self.form(["grant_type": "refresh_token", "refresh_token": store.refreshToken, "client_id": store.clientId])
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status >= 500 || status == 429 { throw BackupError.failed("The site is not answering") }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard status < 400, let access = json["access_token"] as? String else {
            store.signOut()
            throw BackupError.signedOut
        }
        let expires = (json["expires_in"] as? NSNumber)?.doubleValue ?? 3600
        store.saveTokens(accessToken: access, refreshToken: json["refresh_token"] as? String ?? store.refreshToken, expiresIn: expires)
    }

    private static func form(_ values: [String: String]) -> Data {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return values.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }
            .joined(separator: "&").data(using: .utf8)!
    }

    private static func serverMessage(_ data: Data, status: Int) -> String {
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if let messages = json["_server_messages"] as? String,
           let list = (try? JSONSerialization.jsonObject(with: Data(messages.utf8))) as? [String],
           let first = list.first,
           let message = (try? JSONSerialization.jsonObject(with: Data(first.utf8))) as? [String: Any],
           let text = message["message"] as? String {
            return text
        }
        return json["exception"] as? String ?? "The site answered \(status)"
    }
}

private struct Multipart {
    let boundary = "photos" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
    var body = Data()
    var contentType: String { "multipart/form-data; boundary=\(boundary)" }

    mutating func field(_ name: String, _ value: String) {
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
    }

    mutating func file(_ field: String, name: String, mime: String, data: Data) {
        let safe = name.replacingOccurrences(of: "\"", with: "")
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(field)\"; filename=\"\(safe)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
    }
}
